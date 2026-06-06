/*
  Halaman admin pembelian barang gabungan.
  Menampilkan barang/saldo yang perlu restock, dengan opsi centang untuk menampilkan semua item agar tetap bisa dibeli manual.
  Layout dibuat konsisten dengan Laporan Harian: header biru, filter collapse mobile, stat card 2 kolom,
  tabel desktop, card mobile satu lapis, riwayat di bawah tabel, fetch database memakai limit, pagination 50/100/250/500, toast fixed, dan modal pembelian rapi.
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
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
  Cpu,
  ListFilter,
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

type PembelianItem = {
  type: "barang" | "saldo"
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

type RiwayatPembelianRow = {
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
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 250, label: "250" },
  { value: 500, label: "500" },
]

const FETCH_LIMIT_OPTIONS = [
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 250, label: "250" },
  { value: 500, label: "500" },
]

const EMPTY_PEMBELIAN_FORM = {
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

function formatNilai(item: PembelianItem, value: number) {
  return item.type === "saldo" ? formatRupiah(value) : String(value)
}

function getLocalTanggalMeta() {
  const now = new Date()
  const tahun = now.getFullYear()
  const bulan = now.getMonth() + 1
  const tanggal = `${tahun}-${String(bulan).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const bulanKey = `${tahun}-${String(bulan).padStart(2, "0")}`

  return { tanggal, tahun, bulan, bulanKey }
}

function safeFieldKey(value: string) {
  return (
    String(value || "unknown")
      .trim()
      .replace(/[.~*/[\]]/g, "_")
      .replace(/\s+/g, "_") || "unknown"
  )
}

async function updateLaporanPembelianAggregate(params: {
  jenis: "barang" | "saldo"
  item: PembelianItem
  jumlahTambah: number
}) {
  const { jenis, item, jumlahTambah } = params
  const { tanggal, tahun, bulan, bulanKey } = getLocalTanggalMeta()

  const isBarang = jenis === "barang"
  const tokoKey = safeFieldKey(item.tokoId || item.tokoNama || "tanpa_toko")
  const kategoriKey = safeFieldKey(item.kategoriId || item.kategoriNama || "tanpa_kategori")

  const base = {
    tanggal,
    tahun,
    bulan,
    bulanKey,
    updatedAt: serverTimestamp(),
  }

  const counterPayload = isBarang
    ? {
        totalTransaksi: increment(1),
        totalPembelianBarang: increment(1),
        totalKuantitasBarang: increment(jumlahTambah),
        [`perToko.${tokoKey}.tokoId`]: item.tokoId || "",
        [`perToko.${tokoKey}.tokoNama`]: item.tokoNama || "-",
        [`perToko.${tokoKey}.totalTransaksi`]: increment(1),
        [`perToko.${tokoKey}.totalKuantitasBarang`]: increment(jumlahTambah),
        [`perKategori.${kategoriKey}.kategoriId`]: item.kategoriId || "",
        [`perKategori.${kategoriKey}.kategoriNama`]: item.kategoriNama || "-",
        [`perKategori.${kategoriKey}.totalTransaksi`]: increment(1),
        [`perKategori.${kategoriKey}.totalKuantitasBarang`]: increment(jumlahTambah),
      }
    : {
        totalTransaksi: increment(1),
        totalTopupSaldo: increment(1),
        totalNominalSaldo: increment(jumlahTambah),
        [`perKategori.saldo_digital.kategoriId`]: "saldo-digital",
        [`perKategori.saldo_digital.kategoriNama`]: "Saldo Digital",
        [`perKategori.saldo_digital.totalTransaksi`]: increment(1),
        [`perKategori.saldo_digital.totalNominalSaldo`]: increment(jumlahTambah),
      }

  await Promise.all([
    setDoc(
      doc(db, "laporan_pembelian_barang_harian", tanggal),
      {
        ...base,
        ...counterPayload,
      },
      { merge: true }
    ),
    setDoc(
      doc(db, "laporan_pembelian_barang_bulanan", bulanKey),
      {
        tahun,
        bulan,
        bulanKey,
        updatedAt: serverTimestamp(),
        ...counterPayload,
      },
      { merge: true }
    ),
  ])
}

export default function PembelianBarangPage() {
  const router = useRouter()

  const [barangList, setBarangList] = useState<Barang[]>([])
  const [saldoList, setSaldoList] = useState<MasterSaldoDigital[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriBarang[]>([])
  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [riwayatList, setRiwayatList] = useState<RiwayatPembelianRow[]>([])

  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)

  const [search, setSearch] = useState("")
  const [filterKategori, setFilterKategori] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterJenis, setFilterJenis] = useState("")
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [dataLimit, setDataLimit] = useState(50)
  const [showAllItems, setShowAllItems] = useState(false)
  const [page, setPage] = useState(1)

  const [showModal, setShowModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<PembelianItem | null>(null)
  const [pembelianForm, setPembelianForm] = useState(EMPTY_PEMBELIAN_FORM)

  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const showSuccess = (message: string) => {
    setSuccessMsg(message)
    setError(null)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  const showError = (message: string) => {
    setError(message)
    setSuccessMsg(null)
    setTimeout(() => setError(null), 3500)
  }

  const fetchKategori = async () => {
    try {
      const qRef = query(collection(db, "kategori_barang"), orderBy("nama"))
      const snap = await getDocs(qRef)

      setKategoriList(
        snap.docs
          .map((item) => {
            const x = item.data() as any
            return {
              id: item.id,
              nama: x?.nama || "",
            }
          })
          .filter((item) => item.nama)
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
        snap.docs
          .map((item) => {
            const x = item.data() as any
            return {
              id: item.id,
              nama: x?.nama || "",
            }
          })
          .filter((item) => item.nama)
      )
    } catch (error) {
      console.error(error)
      setTokoList([])
    }
  }

  const fetchBarang = async () => {
    const qRef = query(collection(db, "barang"), orderBy("nama"), limit(dataLimit))
    const snap = await getDocs(qRef)

    const list: Barang[] = snap.docs.map((item) => {
      const x = item.data() as any
      return {
        id: item.id,
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
    const qRef = query(collection(db, "master_saldo_digital"), orderBy("namaSaldo"), limit(dataLimit))
    const snap = await getDocs(qRef)

    const list: MasterSaldoDigital[] = snap.docs.map((item) => {
      const x = item.data() as any
      return {
        id: item.id,
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
      const qBarang = query(collection(db, "riwayat_pembelian_barang"), orderBy("createdAt", "desc"), limit(dataLimit))
      const qSaldo = query(collection(db, "riwayat_pembelian_saldo_digital"), orderBy("createdAt", "desc"), limit(dataLimit))

      const [snapBarang, snapSaldo] = await Promise.all([getDocs(qBarang), getDocs(qSaldo)])

      const listBarang: RiwayatPembelianRow[] = snapBarang.docs.map((item) => {
        const x = item.data() as any
        return {
          id: item.id,
          jenis: "barang",
          nama: x?.namaBarang || "",
          sumber: x?.supplier || x?.tokoNama || "-",
          stokSebelum: Number(x?.stokSebelum || 0),
          jumlahTambah: Number(x?.jumlahBeli || x?.jumlahTambah || 0),
          stokSesudah: Number(x?.stokSesudah || 0),
          catatan: x?.catatan || "",
          createdAt:
            typeof x?.createdAt?.toMillis === "function"
              ? x.createdAt.toMillis()
              : Number(x?.createdAt || 0),
        }
      })

      const listSaldo: RiwayatPembelianRow[] = snapSaldo.docs.map((item) => {
        const x = item.data() as any
        return {
          id: item.id,
          jenis: "saldo",
          nama: x?.namaSaldo || "",
          sumber: x?.keterangan || "Saldo Digital",
          stokSebelum: Number(x?.saldoSebelum || 0),
          jumlahTambah: Number(x?.jumlahTopup || x?.jumlahTambah || 0),
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
      await Promise.all([fetchKategori(), fetchToko(), fetchBarang(), fetchSaldo(), fetchRiwayat()])
    } catch (error) {
      console.error(error)
      showError("Gagal memuat data pembelian")
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!auth.currentUser) return
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLimit])

  const pembelianItems = useMemo<PembelianItem[]>(() => {
    const barangNeedPembelian: PembelianItem[] = barangList
      .filter((item) => item.jenisBarang === "fisik")
      .filter((item) => showAllItems || item.stok <= item.stokMinimum)
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

    const saldoNeedPembelian: PembelianItem[] = saldoList
      .filter((item) => item.aktif)
      .filter((item) => showAllItems || item.jumlahSaldo <= item.jumlahMinimum)
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

    return [...barangNeedPembelian, ...saldoNeedPembelian]
  }, [barangList, saldoList, showAllItems])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()

    return pembelianItems
      .filter((item) => {
        const matchSearch =
          !q ||
          item.nama.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.kodeRef.toLowerCase().includes(q) ||
          item.tokoNama.toLowerCase().includes(q) ||
          item.supplier.toLowerCase().includes(q)

        const matchKategori = !filterKategori || (item.type === "barang" && item.kategoriId === filterKategori)
        const matchToko = !filterToko || (item.type === "barang" && item.tokoId === filterToko)
        const matchJenis = !filterJenis || item.type === filterJenis

        return matchSearch && matchKategori && matchToko && matchJenis
      })
      .sort((a, b) => {
        if (b.kekurangan !== a.kekurangan) return b.kekurangan - a.kekurangan
        return a.nama.localeCompare(b.nama, "id")
      })
  }, [pembelianItems, search, filterKategori, filterToko, filterJenis])

  const totalBarangPembelian = filtered.filter((item) => item.type === "barang").length
  const totalSaldoPembelian = filtered.filter((item) => item.type === "saldo").length
  const totalKekuranganBarang = filtered
    .filter((item) => item.type === "barang")
    .reduce((sum, item) => sum + item.kekurangan, 0)
  const totalKekuranganSaldo = filtered
    .filter((item) => item.type === "saldo")
    .reduce((sum, item) => sum + item.kekurangan, 0)

  const totalPages = itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / itemsPerPage))
  const paged = itemsPerPage === 0 ? filtered : filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)
  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  useEffect(() => {
    setPage(1)
  }, [search, filterKategori, filterToko, filterJenis, itemsPerPage, dataLimit, showAllItems])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const openPembelianModal = (item: PembelianItem) => {
    setSelectedItem(item)
    setPembelianForm(EMPTY_PEMBELIAN_FORM)
    setError(null)
    setShowModal(true)
  }

  const closePembelianModal = () => {
    if (submitLoading) return
    setShowModal(false)
    setSelectedItem(null)
    setPembelianForm(EMPTY_PEMBELIAN_FORM)
    setError(null)
  }

  const handleSubmitPembelian = async (e: React.FormEvent) => {
    e.preventDefault()

    const user = auth.currentUser
    if (!user || !selectedItem) return

    const jumlahTambah = Number(pembelianForm.jumlahTambah || 0)
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

        const { tanggal, tahun, bulan, bulanKey } = getLocalTanggalMeta()

        await addDoc(collection(db, "riwayat_pembelian_barang"), {
          jenis: "barang",
          barangId: selectedItem.id,
          namaBarang: selectedItem.nama,
          kodeBarang: selectedItem.kodeRef,
          kategoriId: selectedItem.kategoriId,
          kategoriNama: selectedItem.kategoriNama,
          tokoId: selectedItem.tokoId,
          tokoNama: selectedItem.tokoNama,
          supplier: selectedItem.supplier,
          satuan: selectedItem.satuanLabel,
          stokSebelum,
          jumlahBeli: jumlahTambah,
          jumlahTambah,
          stokSesudah,
          catatan: pembelianForm.catatan.trim(),
          tanggal,
          tahun,
          bulan,
          bulanKey,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        })

        await updateLaporanPembelianAggregate({
          jenis: "barang",
          item: selectedItem,
          jumlahTambah,
        })
      } else {
        const saldoSebelum = Number(selectedItem.stokSekarang || 0)
        const saldoSesudah = saldoSebelum + jumlahTambah

        await updateDoc(doc(db, "master_saldo_digital", selectedItem.id), {
          jumlahSaldo: saldoSesudah,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        })

        const { tanggal, tahun, bulan, bulanKey } = getLocalTanggalMeta()

        await addDoc(collection(db, "riwayat_pembelian_saldo_digital"), {
          jenis: "saldo",
          saldoId: selectedItem.id,
          namaSaldo: selectedItem.nama,
          saldoSebelum,
          jumlahTopup: jumlahTambah,
          jumlahTambah,
          saldoSesudah,
          keterangan: selectedItem.subtitle,
          catatan: pembelianForm.catatan.trim(),
          tanggal,
          tahun,
          bulan,
          bulanKey,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        })

        await updateLaporanPembelianAggregate({
          jenis: "saldo",
          item: selectedItem,
          jumlahTambah,
        })
      }

      closePembelianModal()
      await Promise.all([fetchBarang(), fetchSaldo(), fetchRiwayat()])
      showSuccess(selectedItem.type === "barang" ? "Pembelian barang berhasil disimpan" : "Pembelian saldo berhasil disimpan")
    } catch (error) {
      console.error(error)
      setError("Gagal menyimpan pembelian")
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <div className="relative min-h-full overflow-x-hidden bg-transparent text-slate-900">
      <main className="relative w-full space-y-4 pb-28">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <AlertTriangle size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Pembelian Barang
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Barang fisik dan saldo digital yang perlu ditambah stoknya.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <HeaderButton icon={Package} label="Barang" onClick={() => router.push("/admin/tambah-barang")} />
              <HeaderButton icon={Wallet} label="Saldo" onClick={() => router.push("/admin/tambah-saldo")} />
              <button
                type="button"
                onClick={fetchAll}
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

        {/* Toast */}
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
                <AlertTriangle size={16} className="text-sky-600" strokeWidth={2.5} />
              ) : (
                <AlertCircle size={16} className="text-red-600" strokeWidth={2.5} />
              )}
              <p className={`max-w-xs text-xs font-black ${successMsg ? "text-sky-700" : "text-red-700"}`}>
                {successMsg || error}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search & Filter */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <FieldBox label="Cari Item Pembelian">
                <div className="relative">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    strokeWidth={2.5}
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nama, barcode, supplier, saldo, toko..."
                    className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  />
                </div>
              </FieldBox>
            </div>

            <div className="hidden sm:contents">
              <FilterSelect label="Limit Data" value={String(dataLimit)} onChange={(value) => setDataLimit(Number(value))} icon={Boxes}>
                {FETCH_LIMIT_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect label="Jenis" value={filterJenis} onChange={setFilterJenis} icon={AlertTriangle}>
                <option value="">Semua Jenis</option>
                <option value="barang">Barang</option>
                <option value="saldo">Saldo</option>
              </FilterSelect>

              <FilterSelect label="Kategori" value={filterKategori} onChange={setFilterKategori} icon={Tag}>
                <option value="">Semua Kategori</option>
                {kategoriList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nama}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect label="Toko" value={filterToko} onChange={setFilterToko} icon={Store}>
                <option value="">Semua Toko</option>
                {tokoList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nama}
                  </option>
                ))}
              </FilterSelect>
            </div>
          </div>

          <div className="mt-3 hidden sm:flex">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <input
                type="checkbox"
                checked={showAllItems}
                onChange={(e) => setShowAllItems(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-600">
                Tampilkan semua item agar bisa pembelian manual meski stok belum minimum
              </span>
            </label>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:hidden">
            <button
              type="button"
              onClick={fetchAll}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-white shadow-sm shadow-sky-500/15 disabled:opacity-60"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} strokeWidth={2.5} />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => router.push("/admin/tambah-barang")}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700"
            >
              <Package size={14} strokeWidth={2.5} />
              Barang
            </button>

            <button
              type="button"
              onClick={() => setFilterMobileOpen((prev) => !prev)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] transition ${
                filterMobileOpen ? "border-sky-200 bg-sky-100 text-sky-700" : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <ListFilter size={14} strokeWidth={2.5} />
              Filter
            </button>
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
                  <FilterSelect label="Jenis" value={filterJenis} onChange={setFilterJenis} icon={AlertTriangle}>
                    <option value="">Semua Jenis</option>
                    <option value="barang">Barang</option>
                    <option value="saldo">Saldo</option>
                  </FilterSelect>

                  <FilterSelect label="Kategori" value={filterKategori} onChange={setFilterKategori} icon={Tag}>
                    <option value="">Semua Kategori</option>
                    {kategoriList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nama}
                      </option>
                    ))}
                  </FilterSelect>

                  <FilterSelect label="Toko" value={filterToko} onChange={setFilterToko} icon={Store}>
                    <option value="">Semua Toko</option>
                    {tokoList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nama}
                      </option>
                    ))}
                  </FilterSelect>

                  <FilterSelect
                    label="Limit Data"
                    value={String(dataLimit)}
                    onChange={(value) => setDataLimit(Number(value))}
                    icon={Boxes}
                  >
                    {FETCH_LIMIT_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </FilterSelect>

                  <FilterSelect
                    label="Tampilkan"
                    value={String(itemsPerPage)}
                    onChange={(value) => setItemsPerPage(Number(value))}
                  >
                    {ITEMS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </FilterSelect>

                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={showAllItems}
                      onChange={(e) => setShowAllItems(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-600">
                      Tampilkan semua item
                    </span>
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Stats */}
        <div className="space-y-2 sm:space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <StatCard icon={Package} label="Barang" value={String(totalBarangPembelian)} subValue="Perlu dibeli" tone="sky" />
            <StatCard icon={Boxes} label="Kurang Barang" value={String(totalKekuranganBarang)} subValue="Akumulasi" tone="blue" />
            <StatCard icon={Wallet} label="Saldo" value={String(totalSaldoPembelian)} subValue="Perlu topup" tone="slate" />
            <StatCard icon={Coins} label="Kurang Saldo" value={formatRupiah(totalKekuranganSaldo)} subValue="Nominal" tone="rose" />
          </div>
        </div>

        <PembelianContent
          loading={loading}
          filtered={filtered}
          paged={paged}
          riwayatList={riwayatList}
          itemsPerPage={itemsPerPage}
          showAllItems={showAllItems}
          page={page}
          totalPages={totalPages}
          goPage={goPage}
          openPembelianModal={openPembelianModal}
        />

        <PembelianModal
          show={showModal}
          selectedItem={selectedItem}
          form={pembelianForm}
          setForm={setPembelianForm}
          error={error}
          submitLoading={submitLoading}
          closeModal={closePembelianModal}
          handleSubmit={handleSubmitPembelian}
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
    <FieldBox label={label}>
      <div className="relative">
        {Icon && <Icon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white ${Icon ? "pl-9" : "pl-3"} py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20`}
        >
          {children}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
      </div>
    </FieldBox>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  tone,
}: {
  icon: any
  label: string
  value: string
  subValue?: string
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
          {subValue && (
            <p className="mt-0.5 truncate text-[7px] font-black uppercase tracking-[0.04em] text-slate-400 sm:text-[9px]">
              {subValue}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function HeaderTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-600">
        {title}
      </p>
      <p className="mt-1 text-sm font-black text-slate-800">{subtitle}</p>
    </div>
  )
}

function EmptyBox({ label, icon: Icon }: { label: string; icon: any }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm">
        <Icon size={28} strokeWidth={2} />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  )
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-2">
      <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-xs font-black text-slate-800">{value}</p>
    </div>
  )
}

function PembelianContent({
  loading,
  filtered,
  paged,
  riwayatList,
  itemsPerPage,
  showAllItems,
  page,
  totalPages,
  goPage,
  openPembelianModal,
}: {
  loading: boolean
  filtered: PembelianItem[]
  paged: PembelianItem[]
  riwayatList: RiwayatPembelianRow[]
  itemsPerPage: number
  showAllItems: boolean
  page: number
  totalPages: number
  goPage: (page: number) => void
  openPembelianModal: (item: PembelianItem) => void
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
            Memuat data pembelian...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <HeaderTitle title="Item Pembelian" subtitle={showAllItems ? "Semua barang dan saldo yang bisa dibeli manual" : "Barang dan saldo yang melewati batas minimum"} />


          </div>

          {filtered.length === 0 ? (
            <EmptyBox label={showAllItems ? "Data barang/saldo tidak ditemukan" : "Tidak ada item yang perlu dibeli"} icon={ShieldAlert} />
          ) : (
            <>
              <div className="space-y-2 sm:hidden">
                {paged.map((item, idx) => (
                  <motion.div
                    key={`${item.type}-${item.id}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: idx * 0.03 }}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-100/70"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                        {item.type === "saldo" ? <Wallet size={20} strokeWidth={2.5} /> : <Package size={20} strokeWidth={2.5} />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-sm font-black leading-tight text-slate-800">
                              {item.nama}
                            </p>
                            <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                              {item.type === "barang" ? item.kategoriNama : item.badgeLabel} · {item.tokoNama}
                            </p>
                          </div>

                          <span className={`inline-flex shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${item.type === "saldo" ? "bg-sky-50 text-sky-700" : "bg-rose-50 text-rose-700"}`}>
                            {item.badgeLabel}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                          <MiniInfo label="Sekarang" value={formatNilai(item, item.stokSekarang)} />
                          <MiniInfo label="Minimum" value={formatNilai(item, item.stokMinimum)} />
                          <MiniInfo label="Kurang" value={formatNilai(item, item.kekurangan)} />
                        </div>

                        <button
                          type="button"
                          onClick={() => openPembelianModal(item)}
                          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-sky-500/15"
                        >
                          <PencilLine size={13} strokeWidth={2.6} />
                          Beli Sekarang
                        </button>
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
                        {["No", "Item", "Jenis", "Referensi", "Toko / Sumber", "Sekarang", "Minimum", "Kurang", "Aksi"].map((head) => (
                          <th
                            key={head}
                            className={`whitespace-nowrap px-3 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 ${
                              head === "No" || head === "Aksi" || head === "Sekarang" || head === "Minimum" || head === "Kurang" ? "text-center" : "text-left"
                            }`}
                          >
                            {head}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((item, index) => (
                        <tr key={`${item.type}-${item.id}`} className="border-t border-slate-100 transition-colors hover:bg-sky-50/40">
                          <td className="px-3 py-3 text-center font-bold text-slate-400">
                            {itemsPerPage === 0 ? index + 1 : (page - 1) * itemsPerPage + index + 1}
                          </td>
                          <td className="px-3 py-3">
                            <p className="whitespace-nowrap font-black text-slate-800">{item.nama}</p>
                            <p className="mt-1 max-w-[260px] truncate font-semibold text-slate-500">{item.subtitle}</p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <span className={`rounded-lg px-2 py-1 font-black ${item.type === "saldo" ? "bg-sky-50 text-sky-700" : "bg-rose-50 text-rose-700"}`}>
                              {item.badgeLabel}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">
                            {item.kodeRef || "-"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">
                            {item.type === "barang" ? (
                              <div>
                                <p className="font-black text-slate-800">{item.tokoNama || "-"}</p>
                                <p className="mt-1 inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">
                                  <Truck size={11} strokeWidth={2.5} />
                                  {item.supplier || "-"}
                                </p>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">
                                <Wallet size={11} strokeWidth={2.5} />
                                Saldo Digital
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center font-black text-slate-800">
                            {formatNilai(item, item.stokSekarang)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center font-black text-amber-700">
                            {formatNilai(item, item.stokMinimum)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center font-black text-rose-700">
                            {formatNilai(item, item.kekurangan)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => openPembelianModal(item)}
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-sky-500/15"
                            >
                              <PencilLine size={13} strokeWidth={2.6} />
                              Pembelian
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>

              {itemsPerPage !== 0 && totalPages > 1 && (
                <Pagination page={page} totalPages={totalPages} goPage={goPage} />
              )}
            </>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <HeaderTitle title="Riwayat Terbaru" subtitle="Pembelian barang fisik dan saldo digital" />

          {riwayatList.length === 0 ? (
            <EmptyBox label="Belum ada riwayat pembelian" icon={Wallet} />
          ) : (
            <div className="space-y-3">
              {riwayatList.slice(0, 8).map((item, idx) => (
                <div key={`${item.jenis}-${item.id}`} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-[10px] font-black text-white">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">{item.nama}</p>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {item.jenis === "saldo" ? "Saldo" : "Barang"} · {item.sumber || "-"}
                          </p>
                        </div>
                      </div>

                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        {item.jenis === "saldo"
                          ? `${formatRupiah(item.stokSebelum)} + ${formatRupiah(item.jumlahTambah)} = ${formatRupiah(item.stokSesudah)}`
                          : `${item.stokSebelum} + ${item.jumlahTambah} = ${item.stokSesudah}`}
                      </p>
                      {item.catatan && <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-600">{item.catatan}</p>}
                    </div>

                    <p className="shrink-0 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Pagination({ page, totalPages, goPage }: { page: number; totalPages: number; goPage: (page: number) => void }) {
  return (
    <div className="flex justify-center gap-1.5 pt-3">
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
  [key: string]: any
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>

      <div className="relative">
        <input
          {...props}
          className={`w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20 ${
            rightSlot ? "pr-28" : ""
          }`}
        />
        {rightSlot && <div className="absolute inset-y-0 right-2 flex items-center">{rightSlot}</div>}
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
  [key: string]: any
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
      </label>

      <textarea
        {...props}
        rows={3}
        className="w-full resize-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
      />
    </div>
  )
}

function PembelianModal({
  show,
  selectedItem,
  form,
  setForm,
  error,
  submitLoading,
  closeModal,
  handleSubmit,
}: {
  show: boolean
  selectedItem: PembelianItem | null
  form: typeof EMPTY_PEMBELIAN_FORM
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_PEMBELIAN_FORM>>
  error: string | null
  submitLoading: boolean
  closeModal: () => void
  handleSubmit: (e: React.FormEvent) => void
}) {
  return (
    <AnimatePresence>
      {show && selectedItem && (
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
                  Pembelian {selectedItem.type === "saldo" ? "Saldo" : "Barang"}
                </p>
                <h2 className="truncate text-base font-black text-slate-800">{selectedItem.nama}</h2>
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

                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <ModalStat label="Sekarang" value={formatNilai(selectedItem, selectedItem.stokSekarang)} tone="slate" />
                  <ModalStat label="Minimum" value={formatNilai(selectedItem, selectedItem.stokMinimum)} tone="amber" />
                  <ModalStat label="Kurang" value={formatNilai(selectedItem, selectedItem.kekurangan)} tone="rose" />
                </div>

                <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Detail Item</p>
                  <p className="mt-1 text-xs font-black text-sky-700">
                    {selectedItem.type === "barang"
                      ? `${selectedItem.kategoriNama} · ${selectedItem.tokoNama} · ${selectedItem.supplier}`
                      : `${selectedItem.nama} · saldo digital`}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                  <FormInput
                    label="Jumlah Tambah"
                    required
                    icon={selectedItem.type === "saldo" ? Wallet : Package}
                    inputMode="numeric"
                    value={form.jumlahTambah}
                    onChange={(e: any) =>
                      setForm((prev) => ({
                        ...prev,
                        jumlahTambah: e.target.value.replace(/[^\d]/g, ""),
                      }))
                    }
                    placeholder={selectedItem.type === "saldo" ? "Contoh: 500000" : "Contoh: 10"}
                    rightSlot={
                      <span className="rounded-lg bg-sky-50 px-2.5 py-1 text-[10px] font-black text-sky-700">
                        {selectedItem.type === "saldo" ? formatRupiah(Number(form.jumlahTambah || 0)) : Number(form.jumlahTambah || 0)}
                      </span>
                    }
                  />

                  <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Setelah Pembelian</p>
                    <p className="mt-1 text-sm font-black text-sky-700">
                      {formatNilai(selectedItem, Number(selectedItem.stokSekarang || 0) + Number(form.jumlahTambah || 0))}
                    </p>
                  </div>

                  <div className="sm:col-span-2">
                    <FormTextarea
                      label="Catatan"
                      icon={AlertCircle}
                      value={form.catatan}
                      onChange={(e: any) => setForm((prev) => ({ ...prev, catatan: e.target.value }))}
                      placeholder="Opsional. Contoh: pembelian dari supplier utama / topup saldo dari aplikasi."
                    />
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
                    ) : (
                      <PencilLine size={16} strokeWidth={2.5} />
                    )}
                    {submitLoading ? "Proses" : "Simpan"}
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

function ModalStat({ label, value, tone }: { label: string; value: string; tone: "slate" | "amber" | "rose" }) {
  const cls =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-slate-200 bg-slate-50 text-slate-800"

  return (
    <div className={`rounded-xl border px-2.5 py-2.5 ${cls}`}>
      <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] opacity-70 sm:text-[9px]">{label}</p>
      <p className="mt-1 truncate text-xs font-black sm:text-sm">{value}</p>
    </div>
  )
}
