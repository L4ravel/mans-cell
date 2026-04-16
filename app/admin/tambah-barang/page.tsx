/*
  Halaman admin barang untuk CRUD data barang per toko di Firestore.
  Revisi:
  - pilih jenis barang pakai tab fisik / digital
  - provider digital ambil dari database koleksi provider
  - sumber saldo digital ambil dari database koleksi master_saldo_digital
  - supplier fisik tetap dari koleksi supplier
  - print barcode hanya untuk barang fisik
*/

"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
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
  BadgeDollarSign,
  Barcode,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Package,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Ruler,
  Search,
  ShieldCheck,
  Smartphone,
  Store,
  Tag,
  Trash2,
  Truck,
  Wallet,
  Wifi,
  X,
  Zap,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
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

type ProviderItem = {
  id: string
  nama: string
}

type SaldoItem = {
  id: string
  namaSaldo: string
  jumlahSaldo: number
  aktif: boolean
}

type Toko = {
  id: string
  nama: string
  kode?: string
  pemilik?: string
  aktif?: boolean
}

type JenisKodeUnik = "imei" | "serial" | "custom"
type JenisBarang = "fisik" | "digital"

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
  pakaiKodeUnik?: boolean
  jenisKodeUnik?: JenisKodeUnik
  kodeUnik?: string

  jenisBarang?: JenisBarang
  providerId?: string
  provider?: string
  saldoSourceId?: string
  saldoSourceNama?: string
  nominalProduk?: number
  aktif?: boolean

  createdAt: number
  updatedAt?: number
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
  pakaiKodeUnik: false,
  jenisKodeUnik: "imei" as JenisKodeUnik,
  kodeUnik: "",

  jenisBarang: "fisik" as JenisBarang,
  providerId: "",
  provider: "",
  saldoSourceId: "",
  nominalProduk: "",
  aktif: true,
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

function normalizeKodeUnik(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase()
}

function formatJenisBarangLabel(value?: JenisBarang) {
  return value === "digital" ? "Digital" : "Fisik"
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
  rightSlot?: ReactNode
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
  children: ReactNode
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
  children: ReactNode
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

function BarcodeSvg({ value, className }: { value: string; className?: string }) {
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
  const [providerList, setProviderList] = useState<ProviderItem[]>([])
  const [saldoList, setSaldoList] = useState<SaldoItem[]>([])
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
  const [filterJenisBarang, setFilterJenisBarang] = useState("")
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const [showPrintPicker, setShowPrintPicker] = useState(false)
  const [showPrintPreview, setShowPrintPreview] = useState(false)
  const [printSearch, setPrintSearch] = useState("")
  const [printSelections, setPrintSelections] = useState<Record<string, number>>({})

  const isEdit = !!editId
  const isDigitalForm = form.jenisBarang === "digital"
  const isFisikForm = form.jenisBarang === "fisik"

  const fetchKategori = async () => {
    try {
      const qRef = query(collection(db, "kategori_barang"), orderBy("nama"))
      const snap = await getDocs(qRef)
      setKategoriList(
        snap.docs.map((d) => {
          const x = d.data() as any
          return { id: d.id, nama: x?.nama || "" }
        })
      )
    } catch (e) {
      console.error(e)
      setKategoriList([])
    }
  }

  const fetchSatuan = async () => {
    try {
      const qRef = query(collection(db, "satuan_barang"), orderBy("nama"))
      const snap = await getDocs(qRef)
      setSatuanList(
        snap.docs
          .map((d) => {
            const x = d.data() as any
            return { id: d.id, nama: x?.nama || "" }
          })
          .filter((item) => item.nama)
      )
    } catch (e) {
      console.error(e)
      setSatuanList([])
    }
  }

  const fetchSupplier = async () => {
    try {
      const qRef = query(collection(db, "supplier"), orderBy("nama"))
      const snap = await getDocs(qRef)
      setSupplierList(
        snap.docs
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
      )
    } catch (e) {
      console.error(e)
      setSupplierList([])
    }
  }

  const fetchProvider = async () => {
    try {
      const qRef = query(collection(db, "provider"), orderBy("nama"))
      const snap = await getDocs(qRef)
      setProviderList(
        snap.docs
          .map((d) => {
            const x = d.data() as any
            return {
              id: d.id,
              nama: x?.nama || "",
            }
          })
          .filter((item) => item.nama)
      )
    } catch (e) {
      console.error(e)
      setProviderList([])
    }
  }

  const fetchSaldo = async () => {
    try {
      const qRef = query(collection(db, "master_saldo_digital"), orderBy("namaSaldo"))
      const snap = await getDocs(qRef)
      setSaldoList(
        snap.docs
          .map((d) => {
            const x = d.data() as any
            return {
              id: d.id,
              namaSaldo: x?.namaSaldo || "",
              jumlahSaldo: Number(x?.jumlahSaldo || 0),
              aktif: x?.aktif !== false,
            }
          })
          .filter((item) => item.namaSaldo)
      )
    } catch (e) {
      console.error(e)
      setSaldoList([])
    }
  }

  const fetchToko = async () => {
    try {
      const qRef = query(collection(db, "toko"), orderBy("nama"))
      const snap = await getDocs(qRef)
      setTokoList(
        snap.docs
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
      )
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
          pakaiKodeUnik: Boolean(x?.pakaiKodeUnik),
          jenisKodeUnik: (x?.jenisKodeUnik || "imei") as JenisKodeUnik,
          kodeUnik: x?.kodeUnik || "",

          jenisBarang: (x?.jenisBarang || "fisik") as JenisBarang,
          providerId: x?.providerId || "",
          provider: x?.provider || "",
          saldoSourceId: x?.saldoSourceId || "",
          saldoSourceNama: x?.saldoSourceNama || "",
          nominalProduk: Number(x?.nominalProduk || 0),
          aktif: x?.aktif !== false,

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
      if (!u) return
      await Promise.all([
        fetchKategori(),
        fetchSatuan(),
        fetchSupplier(),
        fetchProvider(),
        fetchSaldo(),
        fetchToko(),
        fetchData(),
      ])
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
        d.satuan.toLowerCase().includes(q) ||
        (d.kodeUnik || "").toLowerCase().includes(q) ||
        (d.jenisKodeUnik || "").toLowerCase().includes(q) ||
        (d.provider || "").toLowerCase().includes(q) ||
        (d.saldoSourceNama || "").toLowerCase().includes(q)

      const matchKategori = !filterKategori || d.kategoriId === filterKategori
      const matchToko = !filterToko || d.tokoId === filterToko
      const matchJenis = !filterJenisBarang || d.jenisBarang === filterJenisBarang

      return matchSearch && matchKategori && matchToko && matchJenis
    })
  }, [data, search, filterKategori, filterToko, filterJenisBarang])

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
    setForm((prev) => ({ ...prev, kodeBarang: generateKodeBarang(tokoId) }))
    setError(null)
  }

  const handleChangeJenisBarang = (nextJenis: JenisBarang) => {
    setForm((prev) => ({
      ...prev,
      jenisBarang: nextJenis,
      kodeBarang: nextJenis === "digital" ? "" : prev.kodeBarang,
      merk: nextJenis === "digital" ? "" : prev.merk,
      satuan: nextJenis === "digital" ? "transaksi" : prev.satuan || "pcs",
      stok: nextJenis === "digital" ? "0" : prev.stok,
      stokMinimum: nextJenis === "digital" ? "0" : prev.stokMinimum,
      pakaiKodeUnik: nextJenis === "fisik" ? prev.pakaiKodeUnik : false,
      jenisKodeUnik: nextJenis === "fisik" ? prev.jenisKodeUnik : "imei",
      kodeUnik: nextJenis === "fisik" ? prev.kodeUnik : "",
      providerId: nextJenis === "digital" ? prev.providerId : "",
      provider: nextJenis === "digital" ? prev.provider : "",
      saldoSourceId: nextJenis === "digital" ? prev.saldoSourceId : "",
      supplier: nextJenis === "digital" ? prev.supplier : prev.supplier,
      nominalProduk: nextJenis === "digital" ? prev.nominalProduk : "",
      aktif: nextJenis === "digital" ? prev.aktif : true,
    }))
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
      satuan: satuanList[0]?.nama || "pcs",
      providerId: providerList[0]?.id || "",
      provider: providerList[0]?.nama || "",
      saldoSourceId: saldoList.find((item) => item.aktif)?.id || saldoList[0]?.id || "",
      aktif: true,
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
      supplier: d.jenisBarang === "digital" ? d.saldoSourceNama || d.supplier || "" : d.supplier || "",
      satuan: d.satuan || "",
      hargaModal: String(d.hargaModal || ""),
      hargaJual: String(d.hargaJual || ""),
      stok: String(d.stok || ""),
      stokMinimum: String(d.stokMinimum || ""),
      pakaiKodeUnik: Boolean(d.pakaiKodeUnik),
      jenisKodeUnik: (d.jenisKodeUnik || "imei") as JenisKodeUnik,
      kodeUnik: d.kodeUnik || "",

      jenisBarang: (d.jenisBarang || "fisik") as JenisBarang,
      providerId: d.providerId || "",
      provider: d.provider || "",
      saldoSourceId: d.saldoSourceId || "",
      nominalProduk: String(d.nominalProduk || ""),
      aktif: d.aktif !== false,
    })
    setEditId(d.id)
    setError(null)
    setShowModal(true)
  }

  const validateForm = () => {
    if (!form.nama.trim()) return "Nama barang wajib diisi"
    if (!form.kategoriId) return "Kategori wajib dipilih"
    if (!form.tokoId) return "Toko wajib dipilih"
    if (isFisikForm && !form.merk.trim()) return "Merk wajib diisi"
    if (!form.hargaModal.trim()) return "Harga modal wajib diisi"
    if (!form.hargaJual.trim()) return "Harga jual wajib diisi"

    if (isFisikForm) {
      const kodeBarangFinal = normalizeBarcode(form.kodeBarang || generateKodeBarang(form.tokoId))
      if (!kodeBarangFinal) return "Barcode / kode barang wajib diisi"
    }

    if (isFisikForm) {
      if (!form.supplier.trim()) return "Supplier wajib dipilih"
      if (!form.satuan.trim()) return "Satuan wajib dipilih"
      if (!form.stok.trim()) return "Stok wajib diisi"
      if (!form.stokMinimum.trim()) return "Stok minimum wajib diisi"
    }

    if (isDigitalForm) {
      if (!form.providerId.trim()) return "Provider wajib dipilih"
      if (!form.nominalProduk.trim()) return "Nominal produk wajib diisi"
      if (!form.saldoSourceId.trim()) return "Sumber saldo wajib dipilih"
    }

    if (isFisikForm && form.pakaiKodeUnik && !normalizeKodeUnik(form.kodeUnik)) {
      return form.jenisKodeUnik === "imei"
        ? "IMEI wajib diisi"
        : form.jenisKodeUnik === "serial"
        ? "Serial number wajib diisi"
        : "Kode unik wajib diisi"
    }

    const hargaModal = Number(form.hargaModal)
    const hargaJual = Number(form.hargaJual)
    const stok = Number(form.stok || 0)
    const stokMinimum = Number(form.stokMinimum || 0)
    const nominalProduk = Number(form.nominalProduk || 0)

    if (Number.isNaN(hargaModal) || hargaModal < 0) return "Harga modal tidak valid"
    if (Number.isNaN(hargaJual) || hargaJual < 0) return "Harga jual tidak valid"
    if (hargaJual < hargaModal) return "Harga jual tidak boleh lebih kecil dari harga modal"

    if (isFisikForm) {
      if (Number.isNaN(stok) || stok < 0) return "Stok tidak valid"
      if (Number.isNaN(stokMinimum) || stokMinimum < 0) return "Stok minimum tidak valid"
    }

    if (isDigitalForm) {
      if (Number.isNaN(nominalProduk) || nominalProduk <= 0) {
        return "Nominal produk tidak valid"
      }

      const saldoDipilih = saldoList.find((item) => item.id === form.saldoSourceId)
      if (!saldoDipilih) return "Sumber saldo tidak ditemukan"
      if (!saldoDipilih.aktif) return "Sumber saldo sedang nonaktif"
    }

    if (isFisikForm) {
      const kodeBarangFinal = normalizeBarcode(form.kodeBarang || generateKodeBarang(form.tokoId))
      const duplicateBarcode = data.find((item) => {
        const sameCode = normalizeBarcode(item.kodeBarang) === kodeBarangFinal
        const sameStore = item.tokoId === form.tokoId
        const notSelf = !editId || item.id !== editId
        return sameCode && sameStore && notSelf
      })

      if (duplicateBarcode) return "Barcode / kode barang sudah dipakai di toko ini"
    }

    if (isFisikForm && form.pakaiKodeUnik) {
      const kodeUnikFinal = normalizeKodeUnik(form.kodeUnik)
      const duplicateKodeUnik = data.find((item) => {
        const sameCode = normalizeKodeUnik(item.kodeUnik || "") === kodeUnikFinal
        const notSelf = !editId || item.id !== editId
        return sameCode && notSelf
      })
      if (duplicateKodeUnik) return "Kode unik / IMEI sudah dipakai"
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

      const providerDipilih = isDigitalForm
        ? providerList.find((item) => item.id === form.providerId)
        : null

      if (isDigitalForm && !providerDipilih) {
        setError("Provider tidak ditemukan")
        return
      }

      const saldoDipilih = isDigitalForm
        ? saldoList.find((item) => item.id === form.saldoSourceId)
        : null

      if (isDigitalForm && !saldoDipilih) {
        setError("Sumber saldo tidak ditemukan")
        return
      }

      if (isFisikForm) {
        const supplier = supplierList.find((s) => s.nama === form.supplier)
        if (!supplier) {
          setError("Supplier tidak ditemukan")
          return
        }
      }

      const kodeBarang = isFisikForm
        ? normalizeBarcode(form.kodeBarang || generateKodeBarang(form.tokoId))
        : ""

      const pakaiKodeUnik = isFisikForm ? Boolean(form.pakaiKodeUnik) : false
      const jenisKodeUnik = form.jenisKodeUnik
      const kodeUnik = pakaiKodeUnik ? normalizeKodeUnik(form.kodeUnik) : ""

      const payload = {
        kodeBarang,
        nama: form.nama.trim(),
        kategoriId: kategori.id,
        kategoriNama: kategori.nama,
        tokoId: toko.id,
        tokoNama: toko.nama,
        merk: isDigitalForm ? "" : form.merk.trim(),
        supplier: isDigitalForm ? (saldoDipilih?.namaSaldo || "") : form.supplier.trim(),
        satuan: isDigitalForm ? "transaksi" : form.satuan.trim(),
        hargaModal: Number(form.hargaModal),
        hargaJual: Number(form.hargaJual),
        stok: isDigitalForm ? 0 : Number(form.stok),
        stokMinimum: isDigitalForm ? 0 : Number(form.stokMinimum),
        pakaiKodeUnik,
        ...(pakaiKodeUnik
          ? {
              jenisKodeUnik,
              kodeUnik,
            }
          : {
              kodeUnik: "",
            }),

        jenisBarang: form.jenisBarang,
        providerId: isDigitalForm ? providerDipilih?.id || "" : "",
        provider: isDigitalForm ? providerDipilih?.nama || "" : "",
        saldoSourceId: isDigitalForm ? saldoDipilih?.id || "" : "",
        saldoSourceNama: isDigitalForm ? saldoDipilih?.namaSaldo || "" : "",
        nominalProduk: isDigitalForm ? Number(form.nominalProduk) : 0,
        aktif: isDigitalForm ? Boolean(form.aktif) : true,
      }

      const now = Date.now()

      if (isEdit && editId) {
        await updateDoc(doc(db, "barang", editId), {
          ...payload,
          updatedAt: now,
          updatedBy: user.uid,
        })

        setData((prev) =>
          [...prev]
            .map((item) =>
              item.id === editId
                ? {
                    ...item,
                    ...payload,
                    jenisKodeUnik: pakaiKodeUnik ? jenisKodeUnik : undefined,
                    kodeUnik,
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
          ...payload,
          createdAt: now,
        }

        await setDoc(newRef, {
          ...newItem,
          createdBy: user.uid,
        })

        setData((prev) => [...prev, newItem].sort((a, b) => a.nama.localeCompare(b.nama)))
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
      if (item.jenisBarang === "digital") return false
      if (!item.kodeBarang) return false

      if (!q) return true
      return (
        item.nama.toLowerCase().includes(q) ||
        item.kodeBarang.toLowerCase().includes(q) ||
        item.merk.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        (item.kodeUnik || "").toLowerCase().includes(q)
      )
    })
  }, [data, printSearch])

  const selectedLabelCount = useMemo(
    () => Object.values(printSelections).reduce((sum, qty) => sum + (qty > 0 ? qty : 0), 0),
    [printSelections]
  )

  const flatPrintItems = useMemo<FlattenPrintItem[]>(() => {
    const result: FlattenPrintItem[] = []
    for (const item of data) {
      if (item.jenisBarang === "digital") continue
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

  const updatePrintQty = (barangId: string, qty: number) => {
    const safeQty = Math.max(0, Math.min(999, Number.isNaN(qty) ? 0 : qty))
    setPrintSelections((prev) => ({ ...prev, [barangId]: safeQty }))
  }

  const togglePrintItem = (item: Barang) => {
    const current = Number(printSelections[item.id] || 0)
    updatePrintQty(item.id, current > 0 ? 0 : 1)
  }

  const quickFillVisible = (qty: number) => {
    const updates: Record<string, number> = {}
    for (const item of printCandidates) updates[item.id] = qty
    setPrintSelections((prev) => ({ ...prev, ...updates }))
  }

  const clearVisible = () => {
    const next = { ...printSelections }
    for (const item of printCandidates) next[item.id] = 0
    setPrintSelections(next)
  }

  const openPrintPreview = () => {
    if (selectedLabelCount <= 0) {
      setSuccessMsg("Pilih minimal 1 barang fisik untuk dicetak")
      setTimeout(() => setSuccessMsg(null), 2500)
      return
    }
    setShowPrintPicker(false)
    setShowPrintPreview(true)
  }

  const handlePrint = () => window.print()

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
            margin-top: -1mm !important;
            border-radius: 0 !important;
          }

          .barcode-svg-print {
            width: 100% !important;
            height: 11mm !important;
            min-height: 11mm !important;
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
            text-align: center !important;
          }
        }
      `}</style>

      <div className="space-y-4 text-slate-900 sm:space-y-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm sm:p-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200/50 sm:h-14 sm:w-14">
                <Package size={22} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
              </div>

              <div className="min-w-0 self-center sm:self-auto">
                <h1 className="text-lg font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                  Data Barang
                </h1>
                <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
                  Barang fisik · barang digital · provider · saldo
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
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
                  onClick={() => router.push("/admin/tambah-kategori")}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:bg-slate-50 sm:w-auto sm:px-3"
                  title="Kategori"
                >
                  <Tag size={13} strokeWidth={3} />
                  <span className="hidden sm:ml-1.5 sm:inline text-[10px] font-black uppercase tracking-wide">
                    Kategori
                  </span>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => router.push("/admin/tambah-provider")}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:bg-slate-50 sm:w-auto sm:px-3"
                  title="Provider"
                >
                  <Wifi size={13} strokeWidth={3} />
                  <span className="hidden sm:ml-1.5 sm:inline text-[10px] font-black uppercase tracking-wide">
                    Provider
                  </span>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => router.push("/admin/tambah-saldo")}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:bg-slate-50 sm:w-auto sm:px-3"
                  title="Master Saldo"
                >
                  <Wallet size={13} strokeWidth={3} />
                  <span className="hidden sm:ml-1.5 sm:inline text-[10px] font-black uppercase tracking-wide">
                    Saldo
                  </span>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => router.push("/admin/tambah-satuan")}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:bg-slate-50 sm:w-auto sm:px-3"
                  title="Satuan"
                >
                  <Ruler size={13} strokeWidth={3} />
                  <span className="hidden sm:ml-1.5 sm:inline text-[10px] font-black uppercase tracking-wide">
                    Satuan
                  </span>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => router.push("/admin/tambah-supplier")}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:bg-slate-50 sm:w-auto sm:px-3"
                  title="Supplier"
                >
                  <Building2 size={13} strokeWidth={3} />
                  <span className="hidden sm:ml-1.5 sm:inline text-[10px] font-black uppercase tracking-wide">
                    Supplier
                  </span>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={openPrintModal}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:bg-slate-50 sm:w-auto sm:px-3"
                  title="Print Barcode"
                >
                  <Printer size={13} strokeWidth={3} />
                  <span className="hidden sm:ml-1.5 sm:inline text-[10px] font-black uppercase tracking-wide">
                    Print Barcode
                  </span>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={openAdd}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 text-white shadow-sm shadow-emerald-200/50 transition-all hover:shadow-md sm:w-auto sm:px-3"
                  title="Tambah Barang"
                >
                  <Plus size={13} strokeWidth={3} />
                  <span className="hidden sm:ml-1.5 sm:inline text-[10px] font-black uppercase tracking-wide">
                    Tambah Barang
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2 lg:col-span-2">
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
                  placeholder="Barcode, nama, provider, saldo, IMEI..."
                  className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>
            </div>

            <FilterSelect
              label="Jenis"
              value={filterJenisBarang}
              onChange={(v) => {
                setFilterJenisBarang(v)
                setPage(1)
              }}
              icon={Package}
            >
              <option value="">Semua Jenis</option>
              <option value="fisik">Fisik</option>
              <option value="digital">Digital</option>
            </FilterSelect>

            <FilterSelect
              label="Kategori"
              value={filterKategori}
              onChange={(v) => {
                setFilterKategori(v)
                setPage(1)
              }}
              icon={Tag}
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
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-16">
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
                const isLowStock = d.jenisBarang === "fisik" && d.stok <= d.stokMinimum

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
                        <p className="text-sm font-black text-slate-800">{d.nama}</p>
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

                    <div className="mt-2 flex flex-wrap gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-black ${
                          d.jenisBarang === "digital"
                            ? "bg-cyan-600 text-white"
                            : "bg-slate-900 text-white"
                        }`}
                      >
                        {d.jenisBarang === "digital" ? (
                          <Smartphone size={11} strokeWidth={2.5} />
                        ) : (
                          <Barcode size={11} strokeWidth={2.5} />
                        )}
                        {formatJenisBarangLabel(d.jenisBarang)}
                      </span>

                      {d.jenisBarang === "fisik" && d.kodeBarang ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-black text-white">
                          <Barcode size={11} strokeWidth={2.5} />
                          {d.kodeBarang}
                        </span>
                      ) : null}

                      {d.jenisBarang === "digital" && d.provider ? (
                        <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          {d.provider}
                        </span>
                      ) : null}

                      {d.jenisBarang === "digital" && d.saldoSourceNama ? (
                        <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                          {d.saldoSourceNama}
                        </span>
                      ) : null}

                      {d.pakaiKodeUnik && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1 text-[10px] font-black uppercase text-white">
                          <ShieldCheck size={11} strokeWidth={2.5} />
                          {d.jenisKodeUnik}: {d.kodeUnik || "-"}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {d.jenisBarang === "fisik" ? (
                        <>
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
                              isLowStock ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            Stok: {d.stok}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            Nominal: {formatRupiah(d.nominalProduk || 0)}
                          </span>
                          <span
                            className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                              d.aktif === false
                                ? "bg-red-100 text-red-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {d.aktif === false ? "Nonaktif" : "Aktif"}
                          </span>
                        </>
                      )}
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
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Barang</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Jenis</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Barcode / Kode</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Toko</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Harga</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Stok / Status</th>
                      <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((d) => {
                      const isLowStock = d.jenisBarang === "fisik" && d.stok <= d.stokMinimum

                      return (
                        <tr key={d.id} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-3">
                            <p className="text-sm font-black text-slate-800">{d.nama}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {d.kategoriNama} · {d.jenisBarang === "digital" ? d.provider || "-" : d.merk || "-"} ·{" "}
                              {d.jenisBarang === "digital" ? d.saldoSourceNama || "-" : d.supplier || "-"}
                            </p>
                            {d.jenisBarang === "digital" ? (
                              <p className="mt-1 text-xs font-semibold text-cyan-600">
                                {d.provider || "-"} · {d.nominalProduk ? formatRupiah(d.nominalProduk) : "-"}
                              </p>
                            ) : null}
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-black ${
                                d.jenisBarang === "digital"
                                  ? "bg-cyan-600 text-white"
                                  : "bg-slate-900 text-white"
                              }`}
                            >
                              {d.jenisBarang === "digital" ? (
                                <Smartphone size={11} strokeWidth={2.5} />
                              ) : (
                                <Package size={11} strokeWidth={2.5} />
                              )}
                              {formatJenisBarangLabel(d.jenisBarang)}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            {d.jenisBarang === "fisik" ? (
                              <div className="flex max-w-full flex-wrap items-center gap-1.5">
                                <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-black text-white">
                                  <Barcode size={11} strokeWidth={2.5} className="shrink-0" />
                                  <span className="truncate">{d.kodeBarang || "-"}</span>
                                </span>

                                {d.pakaiKodeUnik ? (
                                  <>
                                    <span className="text-xs font-black text-slate-400">/</span>
                                    <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1 text-[10px] font-black text-white">
                                      <ShieldCheck size={11} strokeWidth={2.5} className="shrink-0" />
                                      <span className="truncate">
                                        {String(d.jenisKodeUnik || "").toUpperCase()}: {d.kodeUnik || "-"}
                                      </span>
                                    </span>
                                  </>
                                ) : null}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                                  <Wifi size={11} strokeWidth={2.5} />
                                  {d.provider || "-"}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-lg bg-violet-100 px-2.5 py-1 text-[10px] font-black text-violet-700">
                                  <Wallet size={11} strokeWidth={2.5} />
                                  {d.saldoSourceNama || "-"}
                                </span>
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <p className="text-sm font-bold text-slate-700">{d.tokoNama || "-"}</p>
                            <p className="mt-1 text-xs text-slate-500">{d.satuan || "-"}</p>
                          </td>

                          <td className="px-4 py-3">
                            <p className="text-sm font-bold text-slate-700">{formatRupiah(d.hargaJual)}</p>
                            <p className="mt-1 text-xs text-slate-500">Modal: {formatRupiah(d.hargaModal)}</p>
                          </td>

                          <td className="px-4 py-3">
                            {d.jenisBarang === "fisik" ? (
                              <>
                                <span
                                  className={`inline-flex rounded-lg px-2 py-1 text-xs font-black ${
                                    isLowStock ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                                  }`}
                                >
                                  {d.stok}
                                </span>
                                <p className="mt-1 text-xs text-slate-500">Min: {d.stokMinimum}</p>
                              </>
                            ) : (
                              <>
                                <span
                                  className={`inline-flex rounded-lg px-2 py-1 text-xs font-black ${
                                    d.aktif === false
                                      ? "bg-red-100 text-red-700"
                                      : "bg-emerald-100 text-emerald-700"
                                  }`}
                                >
                                  {d.aktif === false ? "Nonaktif" : "Aktif"}
                                </span>
                                <p className="mt-1 text-xs text-slate-500">
                                  Nominal: {formatRupiah(d.nominalProduk || 0)}
                                </p>
                              </>
                            )}
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
                        <Pencil size={18} className="text-white" strokeWidth={2.5} />
                      ) : (
                        <Plus size={18} className="text-white" strokeWidth={3} />
                      )}
                    </div>
                    <div>
                      <h2 className="text-base font-black leading-none text-white">
                        {isEdit ? "Edit Barang" : "Tambah Barang"}
                      </h2>
                      <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                        Support barang fisik dan digital
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

                    <div>
                      <label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Jenis Barang
                      </label>
                      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
                        <button
                          type="button"
                          onClick={() => handleChangeJenisBarang("fisik")}
                          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition-all ${
                            isFisikForm
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          <Package size={16} strokeWidth={2.5} />
                          Barang Fisik
                        </button>

                        <button
                          type="button"
                          onClick={() => handleChangeJenisBarang("digital")}
                          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition-all ${
                            isDigitalForm
                              ? "bg-white text-cyan-700 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          <Smartphone size={16} strokeWidth={2.5} />
                          Barang Digital
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {isFisikForm ? (
                        <FormInput
                          label="Barcode / Kode Barang"
                          required
                          icon={Barcode}
                          value={form.kodeBarang}
                          onChange={(e: any) => setField("kodeBarang")(normalizeBarcode(e.target.value))}
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
                      ) : (
                        <div className="rounded-xl border-2 border-cyan-100 bg-cyan-50 px-4 py-3 sm:col-span-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-cyan-600">
                            Produk Digital
                          </p>
                          <p className="mt-1 text-xs font-semibold text-cyan-700">
                            Produk digital tidak memakai barcode fisik. Sumber saldo akan dipilih dari master saldo.
                          </p>
                        </div>
                      )}

                      <FormInput
                        label="Nama Barang"
                        required
                        icon={Package}
                        value={form.nama}
                        onChange={(e: any) => setField("nama")(e.target.value)}
                        placeholder={isDigitalForm ? "Contoh: Pulsa XL 5K" : "Contoh: Oppo A58"}
                      />

                      <FormSelect
                        label="Kategori"
                        required
                        icon={Tag}
                        value={form.kategoriId}
                        onChange={(e: any) => setField("kategoriId")(e.target.value)}
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

                      {isFisikForm ? (
                        <>
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
                            onChange={(e: any) => setField("supplier")(e.target.value)}
                          >
                            <option value="">Pilih supplier</option>
                            {supplierList.map((s) => (
                              <option key={s.id} value={s.nama}>
                                {s.nama}
                              </option>
                            ))}
                          </FormSelect>
                        </>
                      ) : (
                        <>
                          <FormSelect
                            label="Provider"
                            required
                            icon={Wifi}
                            value={form.providerId}
                            onChange={(e: any) => {
                              const nextId = e.target.value
                              const provider = providerList.find((item) => item.id === nextId)
                              setForm((prev) => ({
                                ...prev,
                                providerId: nextId,
                                provider: provider?.nama || "",
                              }))
                            }}
                          >
                            <option value="">Pilih provider</option>
                            {providerList.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.nama}
                              </option>
                            ))}
                          </FormSelect>

                          <FormSelect
                            label="Sumber Saldo"
                            required
                            icon={Wallet}
                            value={form.saldoSourceId}
                            onChange={(e: any) => setField("saldoSourceId")(e.target.value)}
                          >
                            <option value="">Pilih sumber saldo</option>
                            {saldoList.map((item) => (
                              <option key={item.id} value={item.id} disabled={!item.aktif}>
                                {item.namaSaldo} · {formatRupiah(item.jumlahSaldo)} {item.aktif ? "" : "(Nonaktif)"}
                              </option>
                            ))}
                          </FormSelect>
                        </>
                      )}
                    </div>

                    {isDigitalForm ? (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormInput
                          label="Nominal Produk"
                          required
                          icon={Zap}
                          inputMode="numeric"
                          value={form.nominalProduk}
                          onChange={(e: any) => setField("nominalProduk")(e.target.value.replace(/[^\d]/g, ""))}
                          placeholder="Contoh: 5000"
                        />

                        <FormSelect
                          label="Status Produk"
                          required
                          icon={Check}
                          value={String(form.aktif)}
                          onChange={(e: any) => setField("aktif")(e.target.value === "true")}
                        >
                          <option value="true">Aktif</option>
                          <option value="false">Nonaktif</option>
                        </FormSelect>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormInput
                        label="Harga Modal"
                        required
                        icon={BadgeDollarSign}
                        inputMode="numeric"
                        value={form.hargaModal}
                        onChange={(e: any) => setField("hargaModal")(e.target.value.replace(/[^\d]/g, ""))}
                        placeholder="Contoh: 4500"
                      />

                      <FormInput
                        label="Harga Jual"
                        required
                        icon={BadgeDollarSign}
                        inputMode="numeric"
                        value={form.hargaJual}
                        onChange={(e: any) => setField("hargaJual")(e.target.value.replace(/[^\d]/g, ""))}
                        placeholder="Contoh: 6000"
                      />
                    </div>

                    {isFisikForm ? (
                      <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

                          <div className="rounded-xl border-2 border-slate-200 bg-white px-3 py-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                  Pakai Kode Unik / IMEI
                                </p>
                                <p className="mt-1 text-xs font-semibold text-slate-400">
                                  Aktifkan kalau barang ini punya nomor unik seperti IMEI atau serial.
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => setField("pakaiKodeUnik")(!form.pakaiKodeUnik)}
                                className={`relative inline-flex h-8 w-16 items-center rounded-full transition-all ${
                                  form.pakaiKodeUnik ? "bg-emerald-500" : "bg-slate-300"
                                }`}
                              >
                                <span
                                  className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-all ${
                                    form.pakaiKodeUnik ? "translate-x-9" : "translate-x-1"
                                  }`}
                                />
                              </button>
                            </div>
                          </div>

                          {form.pakaiKodeUnik ? (
                            <>
                              <FormSelect
                                label="Jenis Kode Unik"
                                required
                                icon={ShieldCheck}
                                value={form.jenisKodeUnik}
                                onChange={(e: any) =>
                                  setField("jenisKodeUnik")(e.target.value as JenisKodeUnik)
                                }
                              >
                                <option value="imei">IMEI</option>
                                <option value="serial">Serial Number</option>
                                <option value="custom">Kode Unik Custom</option>
                              </FormSelect>

                              <FormInput
                                label={
                                  form.jenisKodeUnik === "imei"
                                    ? "IMEI"
                                    : form.jenisKodeUnik === "serial"
                                    ? "Serial Number"
                                    : "Kode Unik"
                                }
                                required
                                icon={ShieldCheck}
                                value={form.kodeUnik}
                                onChange={(e: any) => setField("kodeUnik")(normalizeKodeUnik(e.target.value))}
                                placeholder={
                                  form.jenisKodeUnik === "imei"
                                    ? "Contoh: 867530912345678"
                                    : form.jenisKodeUnik === "serial"
                                    ? "Contoh: SN-123456"
                                    : "Contoh: KODE-UNIK-001"
                                }
                              />
                            </>
                          ) : null}

                          <FormInput
                            label="Stok"
                            required
                            icon={Boxes}
                            inputMode="numeric"
                            value={form.stok}
                            onChange={(e: any) => setField("stok")(e.target.value.replace(/[^\d]/g, ""))}
                            placeholder="0"
                          />

                          <FormInput
                            label="Stok Minimum"
                            required
                            icon={Boxes}
                            inputMode="numeric"
                            value={form.stokMinimum}
                            onChange={(e: any) => setField("stokMinimum")(e.target.value.replace(/[^\d]/g, ""))}
                            placeholder="0"
                          />
                        </div>
                      </>
                    ) : null}
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
                      {submitLoading ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Tambah Barang"}
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
                    <h2 className="text-base font-black text-white">Hapus Barang</h2>
                  </div>
                </div>

                <div className="px-6 py-5">
                  <p className="text-sm font-semibold text-slate-600">
                    Yakin ingin menghapus barang ini? Tindakan ini{" "}
                    <span className="font-black text-red-600">tidak dapat dibatalkan</span>.
                  </p>
                </div>

                <div className="flex justify-end gap-3 px-6 pb-5">
                  <button
                    onClick={() => setDeleteId(null)}
                    className="rounded-xl border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-50"
                  >
                    Batal
                  </button>

                  <button
                    onClick={handleDelete}
                    disabled={deleteLoading}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 px-5 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-60"
                  >
                    {deleteLoading ? "Menghapus..." : "Ya, Hapus"}
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
                if (e.target === e.currentTarget) setShowPrintPicker(false)
              }}
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                <div className="flex items-center justify-between bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-4">
                  <div>
                    <h2 className="text-base font-black text-white">Pilih Barang Fisik</h2>
                    <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                      Barang digital tidak ikut print barcode
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPrintPicker(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white hover:bg-white/30"
                  >
                    <X size={16} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="space-y-4 overflow-y-auto p-6">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="flex-1">
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
                          value={printSearch}
                          onChange={(e) => setPrintSearch(e.target.value)}
                          placeholder="Nama, barcode, merk..."
                          className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                        />
                      </div>
                    </div>

                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        onClick={() => quickFillVisible(1)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                      >
                        Pilih Semua
                      </button>
                      <button
                        type="button"
                        onClick={clearVisible}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                      >
                        Bersihkan
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {printCandidates.map((item) => {
                      const qty = Number(printSelections[item.id] || 0)
                      return (
                        <div
                          key={item.id}
                          className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-800">{item.nama}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {item.kodeBarang} · {item.tokoNama}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => togglePrintItem(item)}
                              className={`rounded-xl px-3 py-2 text-xs font-black ${
                                qty > 0
                                  ? "bg-emerald-500 text-white"
                                  : "border border-slate-200 bg-white text-slate-700"
                              }`}
                            >
                              {qty > 0 ? "Dipilih" : "Pilih"}
                            </button>

                            <input
                              type="number"
                              min={0}
                              max={999}
                              value={qty}
                              onChange={(e) => updatePrintQty(item.id, Number(e.target.value))}
                              className="w-24 rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 focus:border-cyan-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-4">
                  <p className="text-xs font-bold text-slate-500">
                    Total label: {selectedLabelCount}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPrintPicker(false)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-100"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={openPrintPreview}
                      className="rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-2 text-sm font-black text-white"
                    >
                      Lanjut Print
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPrintPreview && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setShowPrintPreview(false)
              }}
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative z-10 flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                <div className="flex items-center justify-between bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-4 print-hide">
                  <div>
                    <h2 className="text-base font-black text-white">Preview Barcode</h2>
                    <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                      Total label: {selectedLabelCount}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowPrintPreview(false)}
                      className="rounded-xl border border-white/30 bg-white/20 px-4 py-2 text-sm font-black text-white hover:bg-white/30"
                    >
                      Tutup
                    </button>
                    <button
                      onClick={handlePrint}
                      className="rounded-xl bg-white px-4 py-2 text-sm font-black text-emerald-700"
                    >
                      Print
                    </button>
                  </div>
                </div>

                <div className="overflow-auto p-4">
                  <div
                    id="barcode-print-area"
                    className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="barcode-grid grid grid-cols-2 gap-2 md:grid-cols-4">
                      {flatPrintItems.map((item) => (
                        <div
                          key={item.key}
                          className="barcode-card aspect-[2/1] rounded-md border border-slate-200 bg-white p-2"
                        >
                          <div className="barcode-svg-wrap mt-2 overflow-hidden">
                            <BarcodeSvg value={item.kodeBarang} className="barcode-svg-print" />
                            <p className="barcode-code">{item.kodeBarang}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}