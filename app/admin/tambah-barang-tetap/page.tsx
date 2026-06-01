"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
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
  statusAset?: "aset" | "terjual"
  sudahDijual?: boolean
  hargaAwal?: number
  hargaAsetSebelumDijual?: number
  hargaAsetSesudahDijual?: number
  hargaJual?: number
  nominalPengurangAset?: number
  keuntungan?: number
  soldAtMs?: number
  soldBy?: string
  createdAt: number
  updatedAt?: number
}

type LaporanBarangTetapKategori = {
  kategoriId: string
  kategoriNama: string
  jumlahAset: number
  totalNilai: number
  jumlahTerjual?: number
  totalHargaJual?: number
  totalKeuntunganJual?: number
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

type ApplyLaporanBarangTetapSaleSyncParams = {
  transaction: Transaction
  laporanRef: DocumentReference
  existingData: any
  tokoId: string
  tokoNama: string
  kategoriId: string
  kategoriNama: string
  hargaAsetLama: number
  hargaJual: number
  keuntungan: number
  now: number
}

const COLLECTION_NAME = "barang_tetap"
const LAPORAN_COLLECTION_NAME = "laporan_barang_tetap"
const PENJUALAN_COLLECTION_NAME = "penjualan_barang_tetap"

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

function formatSignedRupiah(value: number) {
  const n = Number(value || 0)
  if (n < 0) return `-${formatRupiah(Math.abs(n))}`
  if (n > 0) return formatRupiah(n)
  return formatRupiah(0)
}

function isBarangTerjual(item?: BarangTetap | null) {
  return Boolean(item?.sudahDijual || item?.statusAset === "terjual")
}

function getModalBarangTetap(item?: BarangTetap | null) {
  if (!item) return 0

  if (isBarangTerjual(item)) {
    return Number(
      item.hargaAwal ||
        item.hargaAsetSebelumDijual ||
        item.hargaAsetSesudahDijual ||
        item.harga ||
        0
    )
  }

  return Number(item.harga || 0)
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
        jumlahTerjual: Number(item?.jumlahTerjual || 0),
        totalHargaJual: Number(item?.totalHargaJual || 0),
        totalKeuntunganJual: Number(item?.totalKeuntunganJual || 0),
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
      jumlahTerjual: 0,
      totalHargaJual: 0,
      totalKeuntunganJual: 0,
    })
  }

  return list
    .filter(
      (item) =>
        Number(item.jumlahAset || 0) > 0 ||
        Number(item.totalNilai || 0) > 0 ||
        Number(item.jumlahTerjual || 0) > 0 ||
        Number(item.totalHargaJual || 0) > 0 ||
        Number(item.totalKeuntunganJual || 0) !== 0
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


function buildKategoriTerjualBreakdown(
  existing: any,
  kategoriId: string,
  kategoriNama: string,
  jumlahTerjualDelta: number,
  hargaJualDelta: number,
  keuntunganDelta: number
): LaporanBarangTetapKategori[] {
  const list: LaporanBarangTetapKategori[] = Array.isArray(existing)
    ? existing.map((item: any) => ({
        kategoriId: String(item?.kategoriId || "").trim(),
        kategoriNama: String(item?.kategoriNama || "Tanpa Kategori").trim(),
        jumlahAset: Number(item?.jumlahAset || 0),
        totalNilai: Number(item?.totalNilai || 0),
        jumlahTerjual: Number(item?.jumlahTerjual || 0),
        totalHargaJual: Number(item?.totalHargaJual || 0),
        totalKeuntunganJual: Number(item?.totalKeuntunganJual || 0),
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
      jumlahTerjual: Math.max(
        0,
        Number(list[index].jumlahTerjual || 0) + Number(jumlahTerjualDelta || 0)
      ),
      totalHargaJual: Math.max(
        0,
        Number(list[index].totalHargaJual || 0) + Number(hargaJualDelta || 0)
      ),
      totalKeuntunganJual:
        Number(list[index].totalKeuntunganJual || 0) + Number(keuntunganDelta || 0),
    }
  } else {
    list.push({
      kategoriId: safeKategoriId,
      kategoriNama: safeKategoriNama,
      jumlahAset: 0,
      totalNilai: 0,
      jumlahTerjual: Math.max(0, Number(jumlahTerjualDelta || 0)),
      totalHargaJual: Math.max(0, Number(hargaJualDelta || 0)),
      totalKeuntunganJual: Number(keuntunganDelta || 0),
    })
  }

  return list
    .filter(
      (item) =>
        Number(item.jumlahAset || 0) > 0 ||
        Number(item.totalNilai || 0) > 0 ||
        Number(item.jumlahTerjual || 0) > 0 ||
        Number(item.totalHargaJual || 0) > 0 ||
        Number(item.totalKeuntunganJual || 0) !== 0
    )
    .sort((a, b) => {
      if (Number(b.totalNilai || 0) !== Number(a.totalNilai || 0)) {
        return Number(b.totalNilai || 0) - Number(a.totalNilai || 0)
      }
      if (Number(b.totalKeuntunganJual || 0) !== Number(a.totalKeuntunganJual || 0)) {
        return Number(b.totalKeuntunganJual || 0) - Number(a.totalKeuntunganJual || 0)
      }
      return a.kategoriNama.localeCompare(b.kategoriNama)
    })
}

function applyLaporanBarangTetapSaleSync({
  transaction,
  laporanRef,
  existingData,
  tokoId,
  tokoNama,
  kategoriId,
  kategoriNama,
  hargaAsetLama,
  hargaJual,
  keuntungan,
  now,
}: ApplyLaporanBarangTetapSaleSyncParams) {
  const safeHargaAsetLama = Math.max(0, Number(hargaAsetLama || 0))
  const safeHargaJual = Math.max(0, Number(hargaJual || 0))
  const safeKeuntungan = Number(keuntungan || 0)

  const jumlahAsetBaru = Math.max(0, Number(existingData?.jumlahAset || 0) - 1)
  const totalNilaiBaru = Math.max(
    0,
    Number(existingData?.totalNilai || 0) - safeHargaAsetLama
  )
  const jumlahTerjualBaru = Math.max(0, Number(existingData?.jumlahTerjual || 0) + 1)
  const totalHargaJualBaru = Math.max(
    0,
    Number(existingData?.totalHargaJual || 0) + safeHargaJual
  )
  const totalKeuntunganJualBaru =
    Number(existingData?.totalKeuntunganJual || 0) + safeKeuntungan

  const kategoriAktifBaru = buildKategoriBreakdown(
    existingData?.kategoriBreakdown,
    kategoriId,
    kategoriNama,
    -1,
    -safeHargaAsetLama
  )

  const kategoriBreakdownBaru = buildKategoriTerjualBreakdown(
    kategoriAktifBaru,
    kategoriId,
    kategoriNama,
    1,
    safeHargaJual,
    safeKeuntungan
  )

  transaction.set(
    laporanRef,
    {
      id: laporanRef.id,
      tokoId,
      tokoNama,
      jumlahAset: jumlahAsetBaru,
      totalNilai: totalNilaiBaru,
      jumlahTerjual: jumlahTerjualBaru,
      totalHargaJual: totalHargaJualBaru,
      totalKeuntunganJual: totalKeuntunganJualBaru,
      kategoriBreakdown: kategoriBreakdownBaru,
      createdAt: existingData?.createdAt || serverTimestamp(),
      createdAtMs: Number(existingData?.createdAtMs || now),
      updatedAt: serverTimestamp(),
      updatedAtMs: now,
      lastSoldAt: serverTimestamp(),
      lastSoldAtMs: now,
    },
    { merge: true }
  )
}


function applyLaporanBarangTetapDeleteSoldSync({
  transaction,
  laporanRef,
  existingData,
  tokoId,
  tokoNama,
  kategoriId,
  kategoriNama,
  hargaJual,
  keuntungan,
  now,
}: {
  transaction: Transaction
  laporanRef: DocumentReference
  existingData: any
  tokoId: string
  tokoNama: string
  kategoriId: string
  kategoriNama: string
  hargaJual: number
  keuntungan: number
  now: number
}) {
  const safeHargaJual = Math.max(0, Number(hargaJual || 0))
  const safeKeuntungan = Number(keuntungan || 0)

  const jumlahTerjualBaru = Math.max(
    0,
    Number(existingData?.jumlahTerjual || 0) - 1
  )
  const totalHargaJualBaru = Math.max(
    0,
    Number(existingData?.totalHargaJual || 0) - safeHargaJual
  )
  const totalKeuntunganJualBaru =
    Number(existingData?.totalKeuntunganJual || 0) - safeKeuntungan

  const kategoriBreakdownBaru = buildKategoriTerjualBreakdown(
    existingData?.kategoriBreakdown,
    kategoriId,
    kategoriNama,
    -1,
    -safeHargaJual,
    -safeKeuntungan
  )

  transaction.set(
    laporanRef,
    {
      id: laporanRef.id,
      tokoId,
      tokoNama,
      jumlahTerjual: jumlahTerjualBaru,
      totalHargaJual: totalHargaJualBaru,
      totalKeuntunganJual: totalKeuntunganJualBaru,
      kategoriBreakdown: kategoriBreakdownBaru,
      createdAt: existingData?.createdAt || serverTimestamp(),
      createdAtMs: Number(existingData?.createdAtMs || now),
      updatedAt: serverTimestamp(),
      updatedAtMs: now,
      lastDeletedSaleAt: serverTimestamp(),
      lastDeletedSaleAtMs: now,
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
  const [sellId, setSellId] = useState<string | null>(null)
  const [sellHarga, setSellHarga] = useState("")
  const [sellLoading, setSellLoading] = useState(false)

  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterKategori, setFilterKategori] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [statModalView, setStatModalView] = useState({
    total: false,
    aktif: false,
    terjual: false,
  })

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
          statusAset: (x?.statusAset || (x?.sudahDijual ? "terjual" : "aset")) as "aset" | "terjual",
          sudahDijual: Boolean(x?.sudahDijual || x?.statusAset === "terjual"),
          hargaAwal: x?.hargaAwal !== undefined ? Number(x.hargaAwal || 0) : undefined,
          hargaAsetSebelumDijual: x?.hargaAsetSebelumDijual !== undefined ? Number(x.hargaAsetSebelumDijual || 0) : undefined,
          hargaAsetSesudahDijual: x?.hargaAsetSesudahDijual !== undefined ? Number(x.hargaAsetSesudahDijual || 0) : undefined,
          hargaJual: x?.hargaJual !== undefined ? Number(x.hargaJual || 0) : undefined,
          nominalPengurangAset: x?.nominalPengurangAset !== undefined ? Number(x.nominalPengurangAset || 0) : undefined,
          keuntungan: x?.keuntungan !== undefined ? Number(x.keuntungan || 0) : undefined,
          soldAtMs: x?.soldAtMs ? Number(x.soldAtMs) : undefined,
          soldBy: x?.soldBy || "",
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

      const statusAset = isBarangTerjual(d) ? "terjual" : "aset"
      const matchKategori = !filterKategori || d.kategoriId === filterKategori
      const matchToko = !filterToko || d.tokoId === filterToko
      const matchStatus = !filterStatus || statusAset === filterStatus

      return matchSearch && matchKategori && matchToko && matchStatus
    })
  }, [data, search, filterKategori, filterToko, filterStatus])

  const totalPages =
    itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / itemsPerPage))

  const paged =
    itemsPerPage === 0
      ? filtered
      : filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  const stats = useMemo(() => {
    const asetAktif = filtered.filter((item) => !isBarangTerjual(item))
    const asetTerjual = filtered.filter((item) => isBarangTerjual(item))

    const totalAset = filtered.length
    const totalAktif = asetAktif.length
    const totalTerjual = asetTerjual.length
    const totalModalAset = filtered.reduce(
      (sum, item) => sum + getModalBarangTetap(item),
      0
    )
    const totalModalAktif = asetAktif.reduce(
      (sum, item) => sum + getModalBarangTetap(item),
      0
    )
    const totalModalTerjual = asetTerjual.reduce(
      (sum, item) => sum + getModalBarangTetap(item),
      0
    )
    const totalKeuntungan = filtered.reduce(
      (sum, item) => sum + Number(item.keuntungan || 0),
      0
    )

    return {
      totalAset,
      totalAktif,
      totalTerjual,
      totalModalAset,
      totalModalAktif,
      totalModalTerjual,
      totalKeuntungan,
    }
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
    if (isBarangTerjual(d)) {
      setSuccessMsg(`Barang ${d.nama} sudah dijual dan tidak bisa diedit lagi`)
      setTimeout(() => setSuccessMsg(null), 3000)
      return
    }

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

  const openSell = (d: BarangTetap) => {
    if (isBarangTerjual(d)) {
      setSuccessMsg(`Barang ${d.nama} sudah dijual dan tidak bisa dijual lagi`)
      setTimeout(() => setSuccessMsg(null), 3000)
      return
    }

    setSellId(d.id)
    setSellHarga("")
    setError(null)
  }

  const closeSellModal = () => {
    if (sellLoading) return
    setSellId(null)
    setSellHarga("")
    setError(null)
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

  const handleSell = async (e: React.FormEvent) => {
    e.preventDefault()

    const user = auth.currentUser
    if (!user || !sellId) return

    const existingItem = data.find((item) => item.id === sellId)
    if (!existingItem) {
      closeSellModal()
      setError("Data barang tetap tidak ditemukan")
      return
    }

    if (isBarangTerjual(existingItem)) {
      closeSellModal()
      setSuccessMsg(`Barang ${existingItem.nama} sudah dijual dan tidak bisa dijual lagi`)
      setTimeout(() => setSuccessMsg(null), 3000)
      return
    }

    const hargaJual = Number(sellHarga || 0)
    if (Number.isNaN(hargaJual) || hargaJual <= 0) {
      setError("Nominal jual wajib diisi dan harus lebih dari 0")
      return
    }

    setSellLoading(true)
    setError(null)

    try {
      const now = Date.now()
      const hargaAsetLama = Number(
        existingItem.hargaAwal ||
          existingItem.hargaAsetSebelumDijual ||
          existingItem.harga ||
          0
      )
      const nominalPengurangAset = hargaAsetLama
      const hargaAsetBaru = 0
      const keuntungan = hargaJual - hargaAsetLama
      const penjualanRef = doc(collection(db, PENJUALAN_COLLECTION_NAME))

      await runTransaction(db, async (transaction) => {
        const barangRef = doc(db, COLLECTION_NAME, existingItem.id)
        const laporanRef = doc(db, LAPORAN_COLLECTION_NAME, existingItem.tokoId)

        const laporanSnap = await transaction.get(laporanRef)
        const laporanData = laporanSnap.exists() ? laporanSnap.data() : null

        transaction.update(barangRef, {
          harga: hargaAsetBaru,
          statusAset: "terjual",
          sudahDijual: true,
          hargaAwal: existingItem.hargaAwal || hargaAsetLama,
          hargaAsetSebelumDijual: hargaAsetLama,
          hargaAsetSesudahDijual: hargaAsetBaru,
          hargaJual,
          nominalPengurangAset,
          keuntungan,
          soldAt: serverTimestamp(),
          soldAtMs: now,
          soldBy: user.uid,
          updatedAt: now,
          updatedBy: user.uid,
        })

        transaction.set(penjualanRef, {
          id: penjualanRef.id,
          barangTetapId: existingItem.id,
          nama: existingItem.nama,
          kategoriId: existingItem.kategoriId || normalizeKategoriKey(existingItem.kategoriNama),
          kategoriNama: existingItem.kategoriNama || "Tanpa Kategori",
          tokoId: existingItem.tokoId,
          tokoNama: existingItem.tokoNama,
          merk: existingItem.merk || "",
          statusAset: "terjual",
          hargaAwal: existingItem.hargaAwal || hargaAsetLama,
          hargaAsetSebelum: hargaAsetLama,
          hargaAsetSesudah: hargaAsetBaru,
          hargaJual,
          nominalPengurangAset,
          keuntungan,
          keterangan:
            keuntungan > 0
              ? `Untung ${formatRupiah(keuntungan)}`
              : keuntungan < 0
                ? `Rugi -${formatRupiah(Math.abs(keuntungan))}`
                : "Impas",
          soldAt: serverTimestamp(),
          soldAtMs: now,
          soldBy: user.uid,
          createdAt: serverTimestamp(),
          createdAtMs: now,
        })

        applyLaporanBarangTetapSaleSync({
          transaction,
          laporanRef,
          existingData: laporanData,
          tokoId: existingItem.tokoId,
          tokoNama: existingItem.tokoNama,
          kategoriId:
            existingItem.kategoriId ||
            normalizeKategoriKey(existingItem.kategoriNama),
          kategoriNama: existingItem.kategoriNama || "Tanpa Kategori",
          hargaAsetLama,
          hargaJual,
          keuntungan,
          now,
        })
      })

      setData((prev) =>
        prev
          .map((item): BarangTetap => {
            if (item.id !== existingItem.id) return item

            return {
              ...item,
              harga: hargaAsetBaru,
              statusAset: "terjual" as const,
              sudahDijual: true,
              hargaAwal: item.hargaAwal || hargaAsetLama,
              hargaAsetSebelumDijual: hargaAsetLama,
              hargaAsetSesudahDijual: hargaAsetBaru,
              hargaJual,
              nominalPengurangAset,
              keuntungan,
              soldAtMs: now,
              soldBy: user.uid,
              updatedAt: now,
            }
          })
          .sort((a, b) => a.nama.localeCompare(b.nama))
      )

      closeSellModal()
      setSuccessMsg(
        keuntungan > 0
          ? `Barang berhasil dijual. Untung ${formatRupiah(keuntungan)} · Sisa nilai ${formatRupiah(hargaAsetBaru)}`
          : keuntungan < 0
            ? `Barang berhasil dijual. Rugi -${formatRupiah(Math.abs(keuntungan))} · Sisa nilai ${formatRupiah(hargaAsetBaru)}`
            : `Barang berhasil dijual. Impas · Sisa nilai ${formatRupiah(hargaAsetBaru)}`
      )
      setTimeout(() => setSuccessMsg(null), 3500)
    } catch (e) {
      console.error(e)
      setError("Gagal menjual barang tetap")
    } finally {
      setSellLoading(false)
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
      const sudahDijual = isBarangTerjual(existingItem)

      const penjualanSnap = sudahDijual
        ? await getDocs(
            query(
              collection(db, PENJUALAN_COLLECTION_NAME),
              where("barangTetapId", "==", existingItem.id)
            )
          )
        : null

      const penjualanList =
        penjualanSnap?.docs.map((d) => {
          const x = d.data() as any
          const hargaAwal = Number(
            x?.hargaAwal ||
              x?.hargaAsetSebelum ||
              x?.hargaAsetSebelumDijual ||
              existingItem.hargaAwal ||
              existingItem.hargaAsetSebelumDijual ||
              0
          )
          const hargaJual = Number(x?.hargaJual || existingItem.hargaJual || 0)
          const keuntungan = Number(
            x?.keuntungan ?? hargaJual - hargaAwal
          )

          return {
            ref: d.ref,
            hargaAwal,
            hargaJual,
            keuntungan,
          }
        }) || []

      const totalHargaJualTerhapus =
        penjualanList.length > 0
          ? penjualanList.reduce((sum, item) => sum + Number(item.hargaJual || 0), 0)
          : Number(existingItem.hargaJual || 0)

      const totalKeuntunganTerhapus =
        penjualanList.length > 0
          ? penjualanList.reduce((sum, item) => sum + Number(item.keuntungan || 0), 0)
          : Number(
              existingItem.keuntungan ??
                Number(existingItem.hargaJual || 0) -
                  Number(
                    existingItem.hargaAwal ||
                      existingItem.hargaAsetSebelumDijual ||
                      0
                  )
            )

      await runTransaction(db, async (transaction) => {
        const barangRef = doc(db, COLLECTION_NAME, deleteId)
        const laporanRef = doc(db, LAPORAN_COLLECTION_NAME, existingItem.tokoId)

        const laporanSnap = await transaction.get(laporanRef)
        const laporanData = laporanSnap.exists() ? laporanSnap.data() : null

        transaction.delete(barangRef)
        penjualanList.forEach((item) => transaction.delete(item.ref))

        if (sudahDijual) {
          applyLaporanBarangTetapDeleteSoldSync({
            transaction,
            laporanRef,
            existingData: laporanData,
            tokoId: existingItem.tokoId,
            tokoNama: existingItem.tokoNama,
            kategoriId:
              existingItem.kategoriId ||
              normalizeKategoriKey(existingItem.kategoriNama),
            kategoriNama: existingItem.kategoriNama || "Tanpa Kategori",
            hargaJual: totalHargaJualTerhapus,
            keuntungan: totalKeuntunganTerhapus,
            now,
          })
        } else {
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
        }
      })

      setData((prev) => prev.filter((item) => item.id !== deleteId))
      setDeleteId(null)
      setSuccessMsg("Data barang tetap berhasil dihapus dan laporan sudah disinkronkan")

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
          <StatCard
            label={statModalView.total ? "Total Modal" : "Total Data"}
            value={statModalView.total ? formatRupiah(stats.totalModalAset) : String(stats.totalAset)}
            icon={Boxes}
            tone="sky"
            active={statModalView.total}            
            onClick={() =>
              setStatModalView((prev) => ({ ...prev, total: !prev.total }))
            }
          />
          <StatCard
            label={statModalView.aktif ? "Modal Aset" : "Aset Tetap"}
            value={statModalView.aktif ? formatRupiah(stats.totalModalAktif) : String(stats.totalAktif)}
            icon={Building2}
            tone="blue"
            active={statModalView.aktif}           
            onClick={() =>
              setStatModalView((prev) => ({ ...prev, aktif: !prev.aktif }))
            }
          />
          <StatCard
            label={statModalView.terjual ? "Modal Terjual" : "Sudah Dijual"}
            value={statModalView.terjual ? formatRupiah(stats.totalModalTerjual) : String(stats.totalTerjual)}
            icon={CheckCircle2}
            tone="slate"
            active={statModalView.terjual}           
            onClick={() =>
              setStatModalView((prev) => ({ ...prev, terjual: !prev.terjual }))
            }
          />
          <StatCard label="Selisih Jual" value={formatSignedRupiah(stats.totalKeuntungan)} icon={BadgeDollarSign} tone="rose" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                label="Status"
                value={filterStatus}
                onChange={(v) => {
                  setFilterStatus(v)
                  setPage(1)
                }}
                icon={CheckCircle2}
              >
                <option value="">Semua Status</option>
                <option value="aset">Aset Tetap</option>
                <option value="terjual">Sudah Dijual</option>
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
                    label="Status"
                    value={filterStatus}
                    onChange={(v) => {
                      setFilterStatus(v)
                      setPage(1)
                    }}
                    icon={CheckCircle2}
                  >
                    <option value="">Semua Status</option>
                    <option value="aset">Aset Tetap</option>
                    <option value="terjual">Sudah Dijual</option>
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
          openSell={openSell}
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

        <SellModal
          target={sellId ? data.find((item) => item.id === sellId) || null : null}
          hargaJual={sellHarga}
          error={error}
          loading={sellLoading}
          onChangeHarga={setSellHarga}
          onClose={closeSellModal}
          onSubmit={handleSell}
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
  onClick,
  active,
  hint,
}: {
  label: string
  value: string
  icon: any
  tone: "slate" | "sky" | "blue" | "rose"
  onClick?: () => void
  active?: boolean
  hint?: string
}) {
  const cls =
    tone === "sky"
      ? "bg-sky-50 text-sky-600"
      : tone === "blue"
        ? "bg-blue-50 text-blue-600"
        : tone === "rose"
          ? "bg-rose-50 text-rose-600"
          : "bg-slate-100 text-slate-500"

  const content = (
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      <div className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-2xl sm:flex sm:h-11 sm:w-11 ${cls}`}>
        <Icon size={18} strokeWidth={2.5} className="sm:h-[21px] sm:w-[21px]" />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-[7px] font-black uppercase tracking-[0.05em] text-slate-400 sm:text-[10px] sm:tracking-widest">
            {label}
          </p>
          {active && (
            <span className="hidden rounded-full bg-sky-50 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-sky-600 sm:inline-flex">
              Modal
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[13px] font-black leading-tight text-slate-800 sm:text-xl">
          {value}
        </p>
        {onClick && hint && (
          <p className="mt-0.5 hidden truncate text-[9px] font-bold text-slate-400 sm:block">
            {active ? "Klik untuk lihat jumlah" : hint}
          </p>
        )}
      </div>
    </div>
  )

  if (onClick) {
    return (
      <motion.button
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.12, ease: "easeOut" }}
        onClick={onClick}
        type="button"
        className={`w-full rounded-2xl border bg-white p-2.5 shadow-sm transition sm:p-4 ${
          active
            ? "border-sky-200 ring-2 ring-sky-100"
            : "border-slate-200 hover:border-sky-200 hover:bg-sky-50/30"
        }`}
        title={active ? "Klik untuk lihat jumlah" : hint}
      >
        {content}
      </motion.button>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4">
      {content}
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
  openSell,
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
  openSell: (item: BarangTetap) => void
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
        {paged.map((item, idx) => {
          const sudahDijual = isBarangTerjual(item)

          return (
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

                  <span
                    className={`inline-flex shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                      sudahDijual
                        ? "bg-slate-100 text-slate-600"
                        : "bg-sky-50 text-sky-700"
                    }`}
                  >
                    {sudahDijual ? "Sudah Dijual" : "Aset Tetap"}
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
                    <span className="truncate">{sudahDijual ? `Sisa nilai: ${formatRupiah(item.harga)}` : formatRupiah(item.harga)}</span>
                  </p>
                  {sudahDijual ? (
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="col-span-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Barang sudah dijual
                        </p>
                      </div>
                      <div className="rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-200">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Harga Jual</p>
                        <p className="mt-0.5 text-[11px] font-black text-slate-700">{formatRupiah(item.hargaJual || 0)}</p>
                      </div>
                      <div className="rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-200">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Keterangan</p>
                        <p
                          className={`mt-0.5 text-[11px] font-black ${
                            Number(item.keuntungan || 0) < 0
                              ? "text-red-700"
                              : Number(item.keuntungan || 0) > 0
                                ? "text-emerald-700"
                                : "text-slate-700"
                          }`}
                        >
                          {formatSignedRupiah(item.keuntungan || 0)}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <motion.button
                    whileTap={{ scale: sudahDijual ? 1 : 0.97 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    onClick={() => !sudahDijual && openEdit(item)}
                    disabled={sudahDijual}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide shadow-sm transition ${
                      sudahDijual
                        ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                        : "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                    }`}
                    type="button"
                  >
                    <Pencil size={13} strokeWidth={2.6} />
                    {sudahDijual ? "Terkunci" : "Edit"}
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: sudahDijual ? 1 : 0.97 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    onClick={() => !sudahDijual && openSell(item)}
                    disabled={sudahDijual}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide shadow-sm transition ${
                      sudahDijual
                        ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                        : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    }`}
                    type="button"
                  >
                    <BadgeDollarSign size={13} strokeWidth={2.6} />
                    {sudahDijual ? "Terjual" : "Jual"}
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
          )
        })}
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
                {["No", "Nama", "Status", "Toko", "Kategori", "Merk", "Nilai Aset", "Harga Jual", "Keterangan", "Aksi"].map((head) => (
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
              {paged.map((item, index) => {
                const sudahDijual = isBarangTerjual(item)

                return (
                <tr key={item.id} className="border-t border-slate-100 transition-colors hover:bg-sky-50/40">
                  <td className="px-3 py-3 text-center font-bold text-slate-400">
                    {itemsPerPage === 0 ? index + 1 : (page - 1) * itemsPerPage + index + 1}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">
                    <div>{item.nama}</div>
                    {sudahDijual ? (
                      <p className="mt-1 text-[10px] font-bold text-slate-500">
                        Barang sudah dijual
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
                        sudahDijual
                          ? "bg-slate-100 text-slate-600"
                          : "bg-sky-50 text-sky-700"
                      }`}
                    >
                      {sudahDijual ? "Sudah Dijual" : "Aset Tetap"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.tokoNama || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.kategoriNama || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.merk || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">
                    {sudahDijual ? formatRupiah(item.harga) : formatRupiah(item.harga)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">
                    {sudahDijual ? formatRupiah(item.hargaJual || 0) : "-"}
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-3 font-black ${
                      !sudahDijual
                        ? "text-slate-400"
                        : Number(item.keuntungan || 0) < 0
                          ? "text-red-700"
                          : Number(item.keuntungan || 0) > 0
                            ? "text-emerald-700"
                            : "text-slate-700"
                    }`}
                  >
                    {sudahDijual ? formatSignedRupiah(item.keuntungan || 0) : "-"}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => !sudahDijual && openEdit(item)}
                        disabled={sudahDijual}
                        className={`flex h-8 w-8 items-center justify-center rounded-xl shadow-sm transition ${
                          sudahDijual
                            ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                            : "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                        }`}
                        title={sudahDijual ? "Barang sudah dijual dan tidak bisa diedit" : "Edit barang tetap"}
                      >
                        <Pencil size={13} strokeWidth={2.6} />
                      </button>

                      <button
                        type="button"
                        onClick={() => !sudahDijual && openSell(item)}
                        disabled={sudahDijual}
                        className={`flex h-8 w-8 items-center justify-center rounded-xl shadow-sm transition ${
                          sudahDijual
                            ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                            : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                        title={sudahDijual ? "Barang sudah dijual" : "Jual barang tetap"}
                      >
                        <BadgeDollarSign size={13} strokeWidth={2.6} />
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
                )
              })}
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


function SellModal({
  target,
  hargaJual,
  error,
  loading,
  onChangeHarga,
  onClose,
  onSubmit,
}: {
  target: BarangTetap | null
  hargaJual: string
  error: string | null
  loading: boolean
  onChangeHarga: (value: string) => void
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
}) {
  const nominalJual = Number(hargaJual || 0)
  const nilaiAset = Number(target?.harga || 0)
  const nominalPengurangAset = Math.min(nilaiAset, nominalJual)
  const sisaNilaiAset = Math.max(0, nilaiAset - nominalJual)
  const keuntungan = nominalJual - nilaiAset
  const sudahDijual = isBarangTerjual(target)

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !loading) onClose()
          }}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-sky-600 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
                  <BadgeDollarSign size={20} className="text-white" strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-black leading-none tracking-tight text-white">
                    Jual Barang Tetap
                  </h2>
                  <p className="mt-1 max-w-[280px] truncate text-[10px] font-bold uppercase tracking-[0.15em] text-white/75">
                    {target.nama}
                  </p>
                </div>
              </div>
              <div className="pointer-events-none absolute right-0 top-0 opacity-10">
                <Cpu size={100} strokeWidth={1} className="text-white" />
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-4 p-5">
              {error && (
                <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5">
                  <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-600" strokeWidth={2.5} />
                  <p className="text-[11px] font-bold text-red-700">{error}</p>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-slate-800">{target.nama}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {target.tokoNama || "-"} · {target.kategoriNama || "-"} · {target.merk || "-"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                      sudahDijual ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {sudahDijual ? "Sudah Dijual" : "Aset Tetap"}
                  </span>
                </div>
                <p className="mt-2 text-xs font-black text-slate-700">
                  Nilai aset sekarang: {formatRupiah(target.harga)}
                </p>
              </div>

              {sudahDijual ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Barang sudah dijual
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
                    Barang ini tidak bisa dijual lagi. Harga jual sebelumnya {formatRupiah(target.hargaJual || 0)} dan keterangan {formatSignedRupiah(target.keuntungan || 0)}.
                  </p>
                </div>
              ) : (
                <>
                  <FieldInput
                    label="Nominal Jual"
                    value={hargaJual}
                    onChange={(value) => onChangeHarga(value.replace(/[^\d]/g, ""))}
                    icon={BadgeDollarSign}
                    inputMode="numeric"
                    placeholder="Contoh: 2500000"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                        Harga Jual
                      </p>
                      <p className="mt-1 text-xs font-black text-sky-700">
                        {formatRupiah(nominalJual)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                        Nilai Dikurangi
                      </p>
                      <p className="mt-1 text-xs font-black text-blue-700">
                        {formatRupiah(nominalPengurangAset)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Sisa Nilai Aset
                      </p>
                      <p className="mt-1 text-xs font-black text-slate-800">
                        {formatRupiah(sisaNilaiAset)}
                      </p>
                    </div>

                    <div
                      className={`rounded-xl border px-3 py-2.5 ${
                        keuntungan < 0
                          ? "border-red-100 bg-red-50/80"
                          : keuntungan > 0
                            ? "border-emerald-100 bg-emerald-50/80"
                            : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <p
                        className={`${
                          keuntungan < 0
                            ? "text-red-600"
                            : keuntungan > 0
                              ? "text-emerald-600"
                              : "text-slate-500"
                        } text-[10px] font-black uppercase tracking-widest`}
                      >
                        Keterangan
                      </p>
                      <p
                        className={`${
                          keuntungan < 0
                            ? "text-red-700"
                            : keuntungan > 0
                              ? "text-emerald-700"
                              : "text-slate-700"
                        } mt-1 text-xs font-black`}
                      >
                        {formatSignedRupiah(keuntungan)}
                      </p>
                    </div>
                  </div>

                  <p className="rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-[11px] font-semibold leading-relaxed text-sky-700">
                    Setelah dijual, barang diberi status sudah dijual dan tidak bisa dijual lagi. Nilai aset dikurangi sesuai nominal jual. Kolom keterangan akan merah jika rugi dan hijau jika untung.
                  </p>
                </>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X size={16} strokeWidth={2.5} />
                  Batal
                </motion.button>

                <motion.button
                  whileTap={{ scale: sudahDijual ? 1 : 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  type="submit"
                  disabled={loading || sudahDijual}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-sky-600 px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-emerald-500/15 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <RefreshCw size={16} className="animate-spin" strokeWidth={2.5} />
                  ) : (
                    <BadgeDollarSign size={16} strokeWidth={2.5} />
                  )}
                  {loading ? "Proses" : sudahDijual ? "Sudah Dijual" : "Jual"}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
                Anda yakin mau menghapus barang tetap ini?
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
