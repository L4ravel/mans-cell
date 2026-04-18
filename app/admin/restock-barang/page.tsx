/*
  Halaman admin restock gabungan.
  Menampilkan:
  - barang fisik yang stoknya <= stok minimum
  - saldo digital yang jumlahSaldo <= jumlahMinimum

  Fitur:
  - restock langsung dari halaman ini
  - simpan riwayat restock barang ke koleksi riwayat_restock_barang
  - simpan riwayat restock saldo digital ke koleksi riwayat_restock_saldo_digital
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  Package,
  PencilLine,
  RefreshCw,
  Search,
  ShieldAlert,
  Store,
  Tag,
  Truck,
  Wallet,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

type Barang = {
  id: string
  nama: string
  kodeBarang: string
  kategoriId: string
  kategoriNama: string
  tokoId: string
  tokoNama: string
  merk: string
  supplier: string
  satuan: string
  stok: number
  stokMinimum: number
  jenisBarang?: "fisik" | "digital"
  updatedAt?: number
}

type MasterSaldoDigital = {
  id: string
  namaSaldo: string
  jumlahSaldo: number
  jumlahMinimum: number
  aktif: boolean
  keterangan: string
  updatedAt?: number
}

type KategoriBarang = {
  id: string
  nama: string
}

type Toko = {
  id: string
  nama: string
}

type RestockItem =
  | {
      type: "barang"
      id: string
      nama: string
      subtitle: string
      tokoId: string
      tokoNama: string
      kategoriId: string
      kategoriNama: string
      supplier: string
      kodeRef: string
      stokSekarang: number
      stokMinimum: number
      kekurangan: number
      satuanLabel: string
      badgeLabel: string
    }
  | {
      type: "saldo"
      id: string
      nama: string
      subtitle: string
      tokoId: string
      tokoNama: string
      kategoriId: string
      kategoriNama: string
      supplier: string
      kodeRef: string
      stokSekarang: number
      stokMinimum: number
      kekurangan: number
      satuanLabel: string
      badgeLabel: string
    }

type RiwayatRestockRow = {
  id: string
  jenis: "barang" | "saldo"
  nama: string
  sumber: string
  stokSebelum: number
  jumlahTambah: number
  stokSesudah: number
  catatan: string
  createdAt?: number
}

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 0, label: "Semua" },
]

const EMPTY_RESTOCK_FORM = {
  jumlahTambah: "",
  catatan: "",
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

function formatNilai(item: RestockItem, value: number) {
  return item.type === "saldo" ? formatRupiah(value) : String(value)
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
  icon: Icon,
  ...props
}: {
  label: string
  icon?: any
  [k: string]: any
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
      </label>

      <textarea
        {...props}
        className="min-h-[110px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
      />
    </div>
  )
}

export default function RestockBarangPage() {
  const router = useRouter()

  const [barangList, setBarangList] = useState<Barang[]>([])
  const [saldoList, setSaldoList] = useState<MasterSaldoDigital[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriBarang[]>([])
  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [riwayatList, setRiwayatList] = useState<RiwayatRestockRow[]>([])

  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)

  const [search, setSearch] = useState("")
  const [filterKategori, setFilterKategori] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterJenis, setFilterJenis] = useState("")
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const [showModal, setShowModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<RestockItem | null>(null)
  const [restockForm, setRestockForm] = useState(EMPTY_RESTOCK_FORM)

  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const fetchKategori = async () => {
    try {
      const qRef = query(collection(db, "kategori_barang"), orderBy("nama"))
      const snap = await getDocs(qRef)

      setKategoriList(
        snap.docs.map((d) => {
          const x = d.data() as any
          return {
            id: d.id,
            nama: x?.nama || "",
          }
        })
      )
    } catch (error) {
      console.error(error)
      setKategoriList([])
    }
  }

  const fetchToko = async () => {
    try {
      const qRef = query(collection(db, "toko"), orderBy("nama"))
      const snap = await getDocs(qRef)

      setTokoList(
        snap.docs.map((d) => {
          const x = d.data() as any
          return {
            id: d.id,
            nama: x?.nama || "",
          }
        })
      )
    } catch (error) {
      console.error(error)
      setTokoList([])
    }
  }

  const fetchBarang = async () => {
    const qRef = query(collection(db, "barang"), orderBy("nama"))
    const snap = await getDocs(qRef)

    const list: Barang[] = snap.docs.map((d) => {
      const x = d.data() as any
      return {
        id: d.id,
        nama: x?.nama || "",
        kodeBarang: x?.kodeBarang || "",
        kategoriId: x?.kategoriId || "",
        kategoriNama: x?.kategoriNama || "",
        tokoId: x?.tokoId || "",
        tokoNama: x?.tokoNama || "",
        merk: x?.merk || "",
        supplier: x?.supplier || "",
        satuan: x?.satuan || "",
        stok: Number(x?.stok || 0),
        stokMinimum: Number(x?.stokMinimum || 0),
        jenisBarang: (x?.jenisBarang || "fisik") as "fisik" | "digital",
        updatedAt:
          typeof x?.updatedAt?.toMillis === "function"
            ? x.updatedAt.toMillis()
            : Number(x?.updatedAt || 0),
      }
    })

    setBarangList(list)
  }

  const fetchSaldo = async () => {
    const qRef = query(collection(db, "master_saldo_digital"), orderBy("namaSaldo"))
    const snap = await getDocs(qRef)

    const list: MasterSaldoDigital[] = snap.docs.map((d) => {
      const x = d.data() as any
      return {
        id: d.id,
        namaSaldo: x?.namaSaldo || "",
        jumlahSaldo: Number(x?.jumlahSaldo || 0),
        jumlahMinimum: Number(x?.jumlahMinimum || 0),
        aktif: x?.aktif !== false,
        keterangan: x?.keterangan || "",
        updatedAt:
          typeof x?.updatedAt?.toMillis === "function"
            ? x.updatedAt.toMillis()
            : Number(x?.updatedAt || 0),
      }
    })

    setSaldoList(list)
  }

  const fetchRiwayat = async () => {
    try {
      const qBarang = query(
        collection(db, "riwayat_restock_barang"),
        orderBy("createdAt", "desc"),
        limit(10)
      )
      const qSaldo = query(
        collection(db, "riwayat_restock_saldo_digital"),
        orderBy("createdAt", "desc"),
        limit(10)
      )

      const [snapBarang, snapSaldo] = await Promise.all([getDocs(qBarang), getDocs(qSaldo)])

      const listBarang: RiwayatRestockRow[] = snapBarang.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          jenis: "barang",
          nama: x?.namaBarang || "",
          sumber: x?.supplier || x?.tokoNama || "-",
          stokSebelum: Number(x?.stokSebelum || 0),
          jumlahTambah: Number(x?.jumlahTambah || 0),
          stokSesudah: Number(x?.stokSesudah || 0),
          catatan: x?.catatan || "",
          createdAt:
            typeof x?.createdAt?.toMillis === "function"
              ? x.createdAt.toMillis()
              : Number(x?.createdAt || 0),
        }
      })

      const listSaldo: RiwayatRestockRow[] = snapSaldo.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          jenis: "saldo",
          nama: x?.namaSaldo || "",
          sumber: x?.keterangan || "Saldo Digital",
          stokSebelum: Number(x?.saldoSebelum || 0),
          jumlahTambah: Number(x?.jumlahTambah || 0),
          stokSesudah: Number(x?.saldoSesudah || 0),
          catatan: x?.catatan || "",
          createdAt:
            typeof x?.createdAt?.toMillis === "function"
              ? x.createdAt.toMillis()
              : Number(x?.createdAt || 0),
        }
      })

      setRiwayatList(
        [...listBarang, ...listSaldo].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      )
    } catch (error) {
      console.error(error)
      setRiwayatList([])
    }
  }

  const fetchAll = async () => {
    setLoading(true)
    setError(null)

    try {
      await Promise.all([
        fetchKategori(),
        fetchToko(),
        fetchBarang(),
        fetchSaldo(),
        fetchRiwayat(),
      ])
    } catch (error) {
      console.error(error)
      setError("Gagal memuat data restock")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) return
      await fetchAll()
    })

    return () => unsub()
  }, [])

  const restockItems = useMemo<RestockItem[]>(() => {
    const barangNeedRestock: RestockItem[] = barangList
      .filter((item) => item.jenisBarang === "fisik")
      .filter((item) => item.stok <= item.stokMinimum)
      .map((item) => ({
        type: "barang",
        id: item.id,
        nama: item.nama,
        subtitle: `${item.kategoriNama} · ${item.merk || "-"} · ${item.satuan || "-"}`,
        tokoId: item.tokoId || "",
        tokoNama: item.tokoNama || "-",
        kategoriId: item.kategoriId || "",
        kategoriNama: item.kategoriNama || "",
        supplier: item.supplier || "-",
        kodeRef: item.kodeBarang || "-",
        stokSekarang: Number(item.stok || 0),
        stokMinimum: Number(item.stokMinimum || 0),
        kekurangan: Math.max(0, Number(item.stokMinimum || 0) - Number(item.stok || 0)),
        satuanLabel: item.satuan || "pcs",
        badgeLabel: "Barang",
      }))

    const saldoNeedRestock: RestockItem[] = saldoList
      .filter((item) => item.aktif)
      .filter((item) => item.jumlahSaldo <= item.jumlahMinimum)
      .map((item) => ({
        type: "saldo",
        id: item.id,
        nama: item.namaSaldo,
        subtitle: item.keterangan || "Sumber saldo digital",
        tokoId: "",
        tokoNama: "-",
        kategoriId: "saldo-digital",
        kategoriNama: "Saldo Digital",
        supplier: "Saldo Digital",
        kodeRef: item.id,
        stokSekarang: Number(item.jumlahSaldo || 0),
        stokMinimum: Number(item.jumlahMinimum || 0),
        kekurangan: Math.max(0, Number(item.jumlahMinimum || 0) - Number(item.jumlahSaldo || 0)),
        satuanLabel: "rupiah",
        badgeLabel: "Saldo",
      }))

    return [...barangNeedRestock, ...saldoNeedRestock]
  }, [barangList, saldoList])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()

    return restockItems
      .filter((item) => {
        const matchSearch =
          !q ||
          item.nama.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.kodeRef.toLowerCase().includes(q) ||
          item.tokoNama.toLowerCase().includes(q) ||
          item.supplier.toLowerCase().includes(q)

        const matchKategori =
          !filterKategori ||
          (item.type === "barang" && item.kategoriId === filterKategori)

        const matchToko =
          !filterToko ||
          (item.type === "barang" && item.tokoId === filterToko)

        const matchJenis = !filterJenis || item.type === filterJenis

        return matchSearch && matchKategori && matchToko && matchJenis
      })
      .sort((a, b) => {
        if (b.kekurangan !== a.kekurangan) return b.kekurangan - a.kekurangan
        return a.nama.localeCompare(b.nama)
      })
  }, [restockItems, search, filterKategori, filterToko, filterJenis])

  const totalBarangRestock = filtered.filter((item) => item.type === "barang").length
  const totalSaldoRestock = filtered.filter((item) => item.type === "saldo").length
  const totalKekuranganBarang = filtered
    .filter((item) => item.type === "barang")
    .reduce((sum, item) => sum + item.kekurangan, 0)
  const totalKekuranganSaldo = filtered
    .filter((item) => item.type === "saldo")
    .reduce((sum, item) => sum + item.kekurangan, 0)

  const totalPages =
    itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / itemsPerPage))

  const paged =
    itemsPerPage === 0
      ? filtered
      : filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  const openRestockModal = (item: RestockItem) => {
    setSelectedItem(item)
    setRestockForm(EMPTY_RESTOCK_FORM)
    setError(null)
    setShowModal(true)
  }

  const closeRestockModal = () => {
    setShowModal(false)
    setSelectedItem(null)
    setRestockForm(EMPTY_RESTOCK_FORM)
    setError(null)
  }

  const handleSubmitRestock = async (e: React.FormEvent) => {
    e.preventDefault()

    const user = auth.currentUser
    if (!user || !selectedItem) return

    const jumlahTambah = Number(restockForm.jumlahTambah || 0)
    if (Number.isNaN(jumlahTambah) || jumlahTambah <= 0) {
      setError("Jumlah tambah harus lebih dari 0")
      return
    }

    setSubmitLoading(true)
    setError(null)

    try {
      if (selectedItem.type === "barang") {
        const stokSebelum = Number(selectedItem.stokSekarang || 0)
        const stokSesudah = stokSebelum + jumlahTambah

        await updateDoc(doc(db, "barang", selectedItem.id), {
          stok: stokSesudah,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        })

        await addDoc(collection(db, "riwayat_restock_barang"), {
          barangId: selectedItem.id,
          namaBarang: selectedItem.nama,
          tokoId: selectedItem.tokoId,
          tokoNama: selectedItem.tokoNama,
          supplier: selectedItem.supplier,
          stokSebelum,
          jumlahTambah,
          stokSesudah,
          catatan: restockForm.catatan.trim(),
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        })
      } else {
        const saldoSebelum = Number(selectedItem.stokSekarang || 0)
        const saldoSesudah = saldoSebelum + jumlahTambah

        await updateDoc(doc(db, "master_saldo_digital", selectedItem.id), {
          jumlahSaldo: saldoSesudah,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        })

        await addDoc(collection(db, "riwayat_restock_saldo_digital"), {
          saldoId: selectedItem.id,
          namaSaldo: selectedItem.nama,
          saldoSebelum,
          jumlahTambah,
          saldoSesudah,
          keterangan: selectedItem.subtitle,
          catatan: restockForm.catatan.trim(),
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        })
      }

      closeRestockModal()
      await Promise.all([fetchBarang(), fetchSaldo(), fetchRiwayat()])
      setSuccessMsg(
        selectedItem.type === "barang"
          ? "Restock barang berhasil disimpan"
          : "Restock saldo berhasil disimpan"
      )
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (error) {
      console.error(error)
      setError("Gagal menyimpan restock")
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <div className="space-y-4 text-slate-900 sm:space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-amber-500 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-200/50 sm:h-14 sm:w-14">
              <AlertTriangle size={22} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
            </div>

            <div className="min-w-0 self-center sm:self-auto">
              <h1 className="text-lg font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                Restock Barang
              </h1>
              <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
                Barang fisik dan saldo digital yang sudah menyentuh batas minimum
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push("/admin/tambah-barang")}
              className="flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-700 shadow-sm transition-all hover:bg-slate-50"
            >
              <Package size={13} strokeWidth={3} />
              <span className="ml-1.5 text-[10px] font-black uppercase tracking-wide">
                Data Barang
              </span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push("/admin/tambah-saldo")}
              className="flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-700 shadow-sm transition-all hover:bg-slate-50"
            >
              <Wallet size={13} strokeWidth={3} />
              <span className="ml-1.5 text-[10px] font-black uppercase tracking-wide">
                Master Saldo
              </span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={fetchAll}
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
              <AlertTriangle size={11} className="text-white" strokeWidth={3} />
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-amber-500 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100">
              <Package size={20} className="text-amber-600" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Barang Restock
              </p>
              <p className="mt-1 text-xl font-black text-slate-800">{totalBarangRestock}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-red-500 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100">
              <Boxes size={20} className="text-red-600" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Kekurangan Barang
              </p>
              <p className="mt-1 text-xl font-black text-slate-800">{totalKekuranganBarang}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-cyan-500 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-100">
              <Wallet size={20} className="text-cyan-600" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Saldo Restock
              </p>
              <p className="mt-1 text-xl font-black text-slate-800">{totalSaldoRestock}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-violet-500 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100">
              <Coins size={20} className="text-violet-600" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Kekurangan Saldo
              </p>
              <p className="mt-1 text-xl font-black text-slate-800">
                {formatRupiah(totalKekuranganSaldo)}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Cari Item Restock
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
                placeholder="Nama, barcode, supplier, saldo, toko..."
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          <FilterSelect
            label="Jenis"
            value={filterJenis}
            onChange={(v) => {
              setFilterJenis(v)
              setPage(1)
            }}
            icon={AlertTriangle}
          >
            <option value="">Semua Jenis</option>
            <option value="barang">Barang</option>
            <option value="saldo">Saldo</option>
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
            {kategoriList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nama}
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
            {tokoList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nama}
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
              className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-amber-500"
            />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Memuat data restock...
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
            <ShieldAlert size={28} className="text-slate-300" strokeWidth={2} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Tidak ada item yang perlu direstock
          </p>
        </motion.div>
      )}

      {!loading && paged.length > 0 && (
        <>
          <div className="space-y-2 sm:hidden">
            {paged.map((item, idx) => (
              <motion.div
                key={`${item.type}-${item.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-800">{item.nama}</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {item.type === "barang" ? item.kategoriNama : item.badgeLabel} · {item.tokoNama}
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-black ${
                      item.type === "saldo"
                        ? "bg-cyan-100 text-cyan-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {item.type === "saldo" ? (
                      <Wallet size={11} strokeWidth={2.5} />
                    ) : (
                      <AlertTriangle size={11} strokeWidth={2.5} />
                    )}
                    {item.badgeLabel}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                    {item.kodeRef || "-"}
                  </span>
                  <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                    {item.type === "barang" ? item.supplier || "-" : "Saldo Digital"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-slate-50 p-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                      Sekarang
                    </p>
                    <p className="mt-1 text-sm font-black text-slate-800">
                      {formatNilai(item, item.stokSekarang)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-amber-50 p-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-500">
                      Minimum
                    </p>
                    <p className="mt-1 text-sm font-black text-amber-700">
                      {formatNilai(item, item.stokMinimum)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-red-50 p-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-red-500">
                      Kurang
                    </p>
                    <p className="mt-1 text-sm font-black text-red-700">
                      {formatNilai(item, item.kekurangan)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => openRestockModal(item)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-2 text-xs font-black text-white shadow-sm"
                >
                  <PencilLine size={13} strokeWidth={2.5} />
                  Restock Sekarang
                </button>
              </motion.div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Item
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Jenis
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Referensi
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Toko / Sumber
                    </th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Sekarang
                    </th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Minimum
                    </th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Kurang
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Aksi
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {paged.map((item) => (
                    <tr key={`${item.type}-${item.id}`} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3">
                        <p className="text-sm font-black text-slate-800">{item.nama}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{item.subtitle}</p>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-lg px-2.5 py-1 text-[10px] font-black ${
                            item.type === "saldo"
                              ? "bg-cyan-100 text-cyan-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {item.badgeLabel}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-black text-white">
                          {item.kodeRef || "-"}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {item.type === "barang" ? (
                          <>
                            <p className="text-sm font-bold text-slate-700">{item.tokoNama || "-"}</p>
                            <div className="mt-1 inline-flex items-center gap-1 rounded-lg bg-violet-100 px-2.5 py-1 text-[10px] font-black text-violet-700">
                              <Truck size={11} strokeWidth={2.5} />
                              {item.supplier || "-"}
                            </div>
                          </>
                        ) : (
                          <div className="inline-flex items-center gap-1 rounded-lg bg-cyan-100 px-2.5 py-1 text-[10px] font-black text-cyan-700">
                            <Wallet size={11} strokeWidth={2.5} />
                            Saldo Digital
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
                          {formatNilai(item, item.stokSekarang)}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-700">
                          {formatNilai(item, item.stokMinimum)}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex rounded-lg bg-red-100 px-2.5 py-1 text-xs font-black text-red-700">
                          {formatNilai(item, item.kekurangan)}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <button
                            onClick={() => openRestockModal(item)}
                            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm"
                          >
                            <PencilLine size={13} strokeWidth={2.5} />
                            Restock
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

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-black text-slate-800">Riwayat Restock Terbaru</h2>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Barang fisik dan saldo digital
            </p>
          </div>
        </div>

        {riwayatList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">Belum ada riwayat restock.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {riwayatList.slice(0, 8).map((item) => (
              <div
                key={`${item.jenis}-${item.id}`}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-black text-slate-800">{item.nama}</p>
                      <span
                        className={`inline-flex rounded-lg px-2 py-1 text-[10px] font-black ${
                          item.jenis === "saldo"
                            ? "bg-cyan-100 text-cyan-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {item.jenis === "saldo" ? "Saldo" : "Barang"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{item.sumber}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {item.jenis === "saldo"
                        ? `${formatRupiah(item.stokSebelum)} + ${formatRupiah(item.jumlahTambah)} = ${formatRupiah(item.stokSesudah)}`
                        : `${item.stokSebelum} + ${item.jumlahTambah} = ${item.stokSesudah}`}
                    </p>
                    {item.catatan ? (
                      <p className="mt-1 text-xs text-slate-600">{item.catatan}</p>
                    ) : null}
                  </div>

                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {formatDateTime(item.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showModal && selectedItem && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeRestockModal()
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
                    <PencilLine size={18} className="text-white" strokeWidth={2.5} />
                  </div>

                  <div>
                    <h2 className="text-base font-black leading-none text-white">
                      Restock {selectedItem.type === "saldo" ? "Saldo" : "Barang"}
                    </h2>
                    <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                      {selectedItem.nama}
                    </p>
                  </div>
                </div>

                <button
                  onClick={closeRestockModal}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white transition-colors hover:bg-white/30"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>

              <form onSubmit={handleSubmitRestock} className="flex-1 overflow-y-auto">
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

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Sekarang
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-800">
                        {formatNilai(selectedItem, selectedItem.stokSekarang)}
                      </p>
                    </div>

                    <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-amber-500">
                        Minimum
                      </p>
                      <p className="mt-1 text-sm font-black text-amber-700">
                        {formatNilai(selectedItem, selectedItem.stokMinimum)}
                      </p>
                    </div>

                    <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-red-500">
                        Kurang
                      </p>
                      <p className="mt-1 text-sm font-black text-red-700">
                        {formatNilai(selectedItem, selectedItem.kekurangan)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border-2 border-cyan-100 bg-cyan-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-cyan-600">
                      Detail Item
                    </p>
                    <p className="mt-1 text-xs font-semibold text-cyan-700">
                      {selectedItem.type === "barang"
                        ? `${selectedItem.kategoriNama} · ${selectedItem.tokoNama} · ${selectedItem.supplier}`
                        : `${selectedItem.nama} · saldo digital`}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormInput
                      label="Jumlah Tambah"
                      required
                      icon={selectedItem.type === "saldo" ? Wallet : Package}
                      inputMode="numeric"
                      value={restockForm.jumlahTambah}
                      onChange={(e: any) =>
                        setRestockForm((prev) => ({
                          ...prev,
                          jumlahTambah: e.target.value.replace(/[^\d]/g, ""),
                        }))
                      }
                      placeholder={selectedItem.type === "saldo" ? "Contoh: 500000" : "Contoh: 10"}
                      rightSlot={
                        <span
                          className={`rounded-lg px-2.5 py-1 text-[10px] font-black ${
                            selectedItem.type === "saldo"
                              ? "bg-cyan-50 text-cyan-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {selectedItem.type === "saldo"
                            ? formatRupiah(Number(restockForm.jumlahTambah || 0))
                            : Number(restockForm.jumlahTambah || 0)}
                        </span>
                      }
                    />

                    <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">
                        Hasil Setelah Restock
                      </p>
                      <p className="mt-1 text-sm font-black text-emerald-700">
                        {formatNilai(
                          selectedItem,
                          Number(selectedItem.stokSekarang || 0) +
                            Number(restockForm.jumlahTambah || 0)
                        )}
                      </p>
                    </div>

                    <div className="sm:col-span-2">
                      <FormTextarea
                        label="Catatan"
                        icon={AlertCircle}
                        value={restockForm.catatan}
                        onChange={(e: any) =>
                          setRestockForm((prev) => ({ ...prev, catatan: e.target.value }))
                        }
                        placeholder="Opsional. Contoh: restock dari supplier utama / topup saldo dari aplikasi."
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
                  <button
                    type="button"
                    onClick={closeRestockModal}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    Batal
                  </button>

                  <button
                    type="submit"
                    disabled={submitLoading}
                    className="rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-2 text-sm font-black text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50"
                  >
                    {submitLoading ? "Menyimpan..." : "Simpan Restock"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}