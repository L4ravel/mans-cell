/*
  app/admin/pembelian-barang/page.tsx
  Halaman admin pembelian barang gabungan.
  Barang hanya tampil setelah toko dipilih, lalu semua barang fisik pada toko tersebut ditampilkan tanpa batas stok minimum.
  Restok barang IMEI mendukung scan tersembunyi dan banyak IMEI sekaligus; 1 IMEI disimpan sebagai 1 unit barang baru.
*/

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  limit,
  where,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
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
  hargaModal: number
  hargaJual: number
  stok: number
  stokMinimum: number
  pakaiKodeUnik?: boolean
  jenisKodeUnik?: "imei" | "serial" | "custom"
  kodeUnik?: string
  statusUnit?: "tersedia" | "terjual" | "retur" | "rusak" | string
  jenisBarang?: "fisik" | "digital"
  parentBarangId?: string
  varianKe?: number
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

type Supplier = {
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
  merk: string
  supplier: string
  kodeRef: string
  hargaModal: number
  hargaJual: number
  stokSekarang: number
  stokMinimum: number
  kekurangan: number
  satuanLabel: string
  badgeLabel: string
  parentBarangId?: string
  varianKe?: number
  pakaiKodeUnik?: boolean
  jenisKodeUnik?: "imei" | "serial" | "custom"
  kodeUnik?: string
  statusUnit?: string
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
  hargaModalBaru?: number
  hargaJualBaru?: number
  modeRestok?: "tambah_stok" | "buat_varian"
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
  hargaModalBaru: "",
  hargaJualBaru: "",
  supplier: "",
  catatan: "",
  kodeUnik: "",
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "")
}

function formatNumberDots(value: unknown) {
  const digits = onlyDigits(value)
  if (!digits) return ""
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(Number(digits))
}

function parseRupiahNumber(value: unknown) {
  const digits = onlyDigits(value)
  if (!digits) return 0
  return Number(digits)
}

function normalizeBarangCode(value: string) {
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

function getKodeUnikListFromText(value: string) {
  return String(value || "")
    .split(/[\n,;]+/)
    .map((item) => normalizeKodeUnik(item))
    .filter(Boolean)
}

function buildAutoImeiUnitCodes(baseCode: string, existingItems: Barang[], count: number) {
  const cleanBase = normalizeBarangCode(String(baseCode || "BRG").replace(/-\d{2}$/g, ""))
  const usedCodes = new Set(existingItems.map((item) => normalizeBarangCode(item.kodeBarang)).filter(Boolean))
  const codes: string[] = []
  let counter = 2

  while (codes.length < count) {
    const code = `${cleanBase}-${String(counter).padStart(2, "0")}`
    if (!usedCodes.has(code)) {
      usedCodes.add(code)
      codes.push(code)
    }
    counter += 1
  }

  return codes
}

function buildAutoVariantName(baseName: string, _nextNumber: number) {
  return String(baseName || "Barang").replace(/\s+-\s+Varian\s+\d+$/i, "").trim() || "Barang"
}

function buildAutoVariantCode(baseCode: string, existingItems: Barang[]) {
  const cleanBase = normalizeBarangCode(String(baseCode || "BRG").replace(/-\d{2}$/g, ""))
  const usedCodes = new Set(existingItems.map((item) => normalizeBarangCode(item.kodeBarang)).filter(Boolean))

  let counter = 2
  let code = `${cleanBase}-${String(counter).padStart(2, "0")}`

  while (usedCodes.has(code)) {
    counter += 1
    code = `${cleanBase}-${String(counter).padStart(2, "0")}`
  }

  return { code, counter }
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
  const [supplierList, setSupplierList] = useState<Supplier[]>([])
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

  const fetchSupplier = async () => {
    try {
      const qRef = query(collection(db, "supplier"), orderBy("nama"))
      const snap = await getDocs(qRef)

      setSupplierList(
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
      setSupplierList([])
    }
  }

  const fetchBarang = async (targetTokoId = filterToko) => {
    if (!targetTokoId) {
      setBarangList([])
      return
    }

    const qRef = query(collection(db, "barang"), where("tokoId", "==", targetTokoId))
    const snap = await getDocs(qRef)

    const list: Barang[] = snap.docs
      .map((item) => {
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
          hargaModal: Number(x?.hargaModal || 0),
          hargaJual: Number(x?.hargaJual || 0),
          stok: Number(x?.stok || 0),
          stokMinimum: Number(x?.stokMinimum || 0),
          pakaiKodeUnik: Boolean(x?.pakaiKodeUnik || x?.kodeUnik),
          jenisKodeUnik: (x?.jenisKodeUnik || "imei") as "imei" | "serial" | "custom",
          kodeUnik: x?.kodeUnik || "",
          statusUnit: x?.statusUnit || "tersedia",
          jenisBarang: (x?.jenisBarang || "fisik") as "fisik" | "digital",
          parentBarangId: x?.parentBarangId || "",
          varianKe: Number(x?.varianKe || 0),
          updatedAt:
            typeof x?.updatedAt?.toMillis === "function"
              ? x.updatedAt.toMillis()
              : Number(x?.updatedAt || 0),
        }
      })
      .sort((a, b) => a.nama.localeCompare(b.nama, "id"))

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
          hargaModalBaru: Number(x?.hargaModalBaru || 0),
          hargaJualBaru: Number(x?.hargaJualBaru || 0),
          modeRestok: x?.modeRestok || "tambah_stok",
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
      await Promise.all([fetchKategori(), fetchToko(), fetchSupplier(), fetchBarang(), fetchSaldo(), fetchRiwayat()])
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
    fetchSaldo()
    fetchRiwayat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLimit])

  useEffect(() => {
    if (!auth.currentUser) return
    fetchBarang(filterToko)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterToko])

  const pembelianItems = useMemo<PembelianItem[]>(() => {
    if (!filterToko) return []

    const barangNeedPembelian: PembelianItem[] = barangList
      .filter((item) => item.jenisBarang === "fisik")
      .map((item) => ({
        type: "barang",
        id: item.id,
        nama: item.nama,
        subtitle: `${item.kategoriNama} · ${item.merk || "-"} · ${item.satuan || "-"}`,
        tokoId: item.tokoId || "",
        tokoNama: item.tokoNama || "-",
        kategoriId: item.kategoriId || "",
        kategoriNama: item.kategoriNama || "",
        merk: item.merk || "",
        supplier: item.supplier || "-",
        kodeRef: item.kodeBarang || "-",
        hargaModal: Number(item.hargaModal || 0),
        hargaJual: Number(item.hargaJual || 0),
        stokSekarang: Number(item.stok || 0),
        stokMinimum: Number(item.stokMinimum || 0),
        kekurangan: Math.max(0, Number(item.stokMinimum || 0) - Number(item.stok || 0)),
        satuanLabel: item.satuan || "pcs",
        badgeLabel: "Barang",
        parentBarangId: item.parentBarangId || "",
        varianKe: Number(item.varianKe || 0),
        pakaiKodeUnik: Boolean(item.pakaiKodeUnik || item.kodeUnik),
        jenisKodeUnik: (item.jenisKodeUnik || "imei") as "imei" | "serial" | "custom",
        kodeUnik: item.kodeUnik || "",
        statusUnit: item.statusUnit || "tersedia",
      }))

    return barangNeedPembelian
  }, [barangList, filterToko])

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
  }, [search, filterKategori, filterToko, filterJenis, itemsPerPage, dataLimit])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const openPembelianModal = (item: PembelianItem) => {
    setSelectedItem(item)
    setPembelianForm({
      jumlahTambah: "",
      hargaModalBaru: item.type === "barang" ? formatNumberDots(item.hargaModal) : "",
      hargaJualBaru: item.type === "barang" ? formatNumberDots(item.hargaJual) : "",
      supplier: item.type === "barang" ? item.supplier || "" : "",
      catatan: "",
      kodeUnik: "",
    })
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

    const isBarang = selectedItem.type === "barang"
    const isImeiRestok = isBarang && Boolean(selectedItem.pakaiKodeUnik) && (selectedItem.jenisKodeUnik || "imei") === "imei"
    const kodeUnikList = isImeiRestok ? getKodeUnikListFromText(pembelianForm.kodeUnik) : []
    const jumlahTambah = isImeiRestok ? kodeUnikList.length : Number(pembelianForm.jumlahTambah || 0)

    if (Number.isNaN(jumlahTambah) || jumlahTambah <= 0) {
      setError(isImeiRestok ? "Minimal 1 IMEI baru wajib discan" : "Jumlah tambah harus lebih dari 0")
      return
    }

    if (isImeiRestok) {
      const duplicateInput = kodeUnikList.find((kode, index) => kodeUnikList.indexOf(kode) !== index)
      if (duplicateInput) {
        setError(`${duplicateInput} dobel di daftar scan`)
        return
      }
    }

    const hargaModalBaru = parseRupiahNumber(pembelianForm.hargaModalBaru)
    const hargaJualBaru = parseRupiahNumber(pembelianForm.hargaJualBaru)
    const supplierBaru = pembelianForm.supplier.trim() || selectedItem.supplier || "-"

    if (selectedItem.type === "barang") {
      if (hargaModalBaru <= 0) {
        setError("Harga modal baru harus diisi")
        return
      }

      if (hargaJualBaru <= 0) {
        setError("Harga jual baru harus diisi")
        return
      }
    }

    setSubmitLoading(true)
    setError(null)

    try {
      if (selectedItem.type === "barang") {
        const hargaModalLama = Number(selectedItem.hargaModal || 0)
        const hargaJualLama = Number(selectedItem.hargaJual || 0)
        const hargaBerubah = hargaModalBaru !== hargaModalLama || hargaJualBaru !== hargaJualLama
        const totalModalRestok = hargaModalBaru * jumlahTambah
        const { tanggal, tahun, bulan, bulanKey } = getLocalTanggalMeta()

        let targetItem = selectedItem
        let targetBarangId = selectedItem.id
        let targetNamaBarang = selectedItem.nama
        let targetKodeBarang = selectedItem.kodeRef
        let stokSebelum = Number(selectedItem.stokSekarang || 0)
        let stokSesudah = stokSebelum + jumlahTambah
        let modeRestok: "tambah_stok" | "buat_varian" = "tambah_stok"

        if (isImeiRestok) {
          const snapKodeUnik = await getDocs(collection(db, "barang"))
          const kodeUnikTerpakai = new Set(
            snapKodeUnik.docs
              .map((item) => normalizeKodeUnik(String((item.data() as any)?.kodeUnik || "")))
              .filter(Boolean)
          )
          const duplicateDatabase = kodeUnikList.find((kode) => kodeUnikTerpakai.has(kode))

          if (duplicateDatabase) {
            setError(`${duplicateDatabase} sudah pernah terdaftar di sistem`)
            return
          }

          const batch = writeBatch(db)
          const unitCodes = buildAutoImeiUnitCodes(selectedItem.kodeRef, barangList, kodeUnikList.length)
          const batchKey = `${user.uid}_${Date.now()}`

          kodeUnikList.forEach((kodeUnik, index) => {
            const newBarangRef = doc(collection(db, "barang"))
            batch.set(newBarangRef, {
              nama: selectedItem.nama,
              kodeBarang: unitCodes[index],
              kategoriId: selectedItem.kategoriId,
              kategoriNama: selectedItem.kategoriNama,
              tokoId: selectedItem.tokoId,
              tokoNama: selectedItem.tokoNama,
              merk: selectedItem.merk || "",
              supplier: supplierBaru,
              satuan: selectedItem.satuanLabel,
              hargaModal: hargaModalBaru,
              hargaJual: hargaJualBaru,
              stok: 1,
              stokMinimum: 0,
              jenisBarang: "fisik",
              pakaiKodeUnik: true,
              jenisKodeUnik: "imei",
              kodeUnik,
              statusUnit: "tersedia",
              parentBarangId: selectedItem.parentBarangId || selectedItem.id,
              sourceBarangId: selectedItem.id,
              restokBatch: batchKey,
              restokIndex: index + 1,
              restokTotal: kodeUnikList.length,
              createdAt: Date.now() + index,
              createdBy: user.uid,
              updatedAt: serverTimestamp(),
              updatedBy: user.uid,
            })
          })

          await batch.commit()

          targetBarangId = selectedItem.parentBarangId || selectedItem.id
          targetNamaBarang = selectedItem.nama
          targetKodeBarang = selectedItem.kodeRef
          modeRestok = "buat_varian"

          targetItem = {
            ...selectedItem,
            supplier: supplierBaru,
            hargaModal: hargaModalBaru,
            hargaJual: hargaJualBaru,
            stokSekarang: stokSesudah,
          }
        } else if (hargaBerubah) {
          const variantCode = buildAutoVariantCode(selectedItem.kodeRef, barangList)
          const variantName = buildAutoVariantName(selectedItem.nama, variantCode.counter)
          const newBarangRef = doc(collection(db, "barang"))

          targetBarangId = newBarangRef.id
          targetNamaBarang = variantName
          targetKodeBarang = variantCode.code
          stokSebelum = 0
          stokSesudah = jumlahTambah
          modeRestok = "buat_varian"

          await setDoc(newBarangRef, {
            nama: variantName,
            kodeBarang: variantCode.code,
            kategoriId: selectedItem.kategoriId,
            kategoriNama: selectedItem.kategoriNama,
            tokoId: selectedItem.tokoId,
            tokoNama: selectedItem.tokoNama,
            merk: selectedItem.merk || "",
            supplier: supplierBaru,
            satuan: selectedItem.satuanLabel,
            hargaModal: hargaModalBaru,
            hargaJual: hargaJualBaru,
            stok: jumlahTambah,
            stokMinimum: selectedItem.stokMinimum,
            jenisBarang: "fisik",
            pakaiKodeUnik: false,
            kodeUnik: "",
            parentBarangId: selectedItem.parentBarangId || selectedItem.id,
            sourceBarangId: selectedItem.id,
            varianKe: variantCode.counter,
            createdAt: Date.now(),
            createdBy: user.uid,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          })

          targetItem = {
            ...selectedItem,
            id: targetBarangId,
            nama: targetNamaBarang,
            supplier: supplierBaru,
            kodeRef: targetKodeBarang,
            hargaModal: hargaModalBaru,
            hargaJual: hargaJualBaru,
            stokSekarang: stokSesudah,
            parentBarangId: selectedItem.parentBarangId || selectedItem.id,
            varianKe: variantCode.counter,
          }
        } else {
          await updateDoc(doc(db, "barang", selectedItem.id), {
            stok: stokSesudah,
            supplier: supplierBaru,
            hargaModal: hargaModalBaru,
            hargaJual: hargaJualBaru,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          })

          targetItem = {
            ...selectedItem,
            supplier: supplierBaru,
            hargaModal: hargaModalBaru,
            hargaJual: hargaJualBaru,
            stokSekarang: stokSesudah,
          }
        }

        await addDoc(collection(db, "riwayat_pembelian_barang"), {
          jenis: "barang",
          modeRestok,
          barangId: targetBarangId,
          sourceBarangId: selectedItem.id,
          parentBarangId: selectedItem.parentBarangId || selectedItem.id,
          namaBarang: targetNamaBarang,
          namaBarangAsal: selectedItem.nama,
          kodeBarang: targetKodeBarang,
          kodeBarangAsal: selectedItem.kodeRef,
          kategoriId: selectedItem.kategoriId,
          kategoriNama: selectedItem.kategoriNama,
          tokoId: selectedItem.tokoId,
          tokoNama: selectedItem.tokoNama,
          supplier: supplierBaru,
          supplierLama: selectedItem.supplier || "-",
          satuan: selectedItem.satuanLabel,
          hargaModalLama,
          hargaJualLama,
          hargaModalBaru,
          hargaJualBaru,
          totalModalRestok,
          stokSebelum,
          jumlahBeli: jumlahTambah,
          jumlahTambah,
          stokSesudah,
          pakaiKodeUnik: isImeiRestok,
          jenisKodeUnik: isImeiRestok ? "imei" : selectedItem.jenisKodeUnik || "",
          kodeUnikList: isImeiRestok ? kodeUnikList : [],
          totalKodeUnik: isImeiRestok ? kodeUnikList.length : 0,
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
          item: targetItem,
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
      showSuccess(
        selectedItem.type === "barang"
          ? isImeiRestok
            ? `${jumlahTambah} IMEI baru berhasil disimpan`
            : "Pembelian barang berhasil disimpan"
          : "Pembelian saldo berhasil disimpan"
      )
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
                  Pilih toko terlebih dahulu untuk melihat semua barang fisik yang bisa dibeli.
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
              <FilterSelect label="Limit Riwayat" value={String(dataLimit)} onChange={(value) => setDataLimit(Number(value))} icon={Boxes}>
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
                <option value="">Pilih Toko</option>
                {tokoList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nama}
                  </option>
                ))}
              </FilterSelect>
            </div>
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
                    <option value="">Pilih Toko</option>
                    {tokoList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nama}
                      </option>
                    ))}
                  </FilterSelect>

                  <FilterSelect
                    label="Limit Riwayat"
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

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Stats */}
        <div className="space-y-2 sm:space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <StatCard icon={Package} label="Barang" value={String(totalBarangPembelian)} subValue="Toko dipilih" tone="sky" />
            <StatCard icon={Boxes} label="Kurang Barang" value={String(totalKekuranganBarang)} subValue="Di bawah minimum" tone="blue" />
            <StatCard icon={Wallet} label="Saldo" value={String(totalSaldoPembelian)} subValue="Riwayat tetap ada" tone="slate" />
            <StatCard icon={Coins} label="Kurang Saldo" value={formatRupiah(totalKekuranganSaldo)} subValue="Di bawah minimum" tone="rose" />
          </div>
        </div>

        <PembelianContent
          loading={loading}
          filtered={filtered}
          paged={paged}
          riwayatList={riwayatList}
          itemsPerPage={itemsPerPage}
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
          supplierList={supplierList}
          barangList={barangList}
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
            <HeaderTitle title="Item Pembelian" subtitle="Pilih toko terlebih dahulu, lalu semua barang fisik toko tersebut akan tampil" />


          </div>

          {filtered.length === 0 ? (
            <EmptyBox label="Pilih toko terlebih dahulu atau data barang toko ini belum tersedia" icon={ShieldAlert} />
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
        <select
          {...props}
          className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-3 pr-9 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          strokeWidth={2.5}
        />
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
  supplierList,
  barangList,
  error,
  submitLoading,
  closeModal,
  handleSubmit,
}: {
  show: boolean
  selectedItem: PembelianItem | null
  form: typeof EMPTY_PEMBELIAN_FORM
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_PEMBELIAN_FORM>>
  supplierList: Supplier[]
  barangList: Barang[]
  error: string | null
  submitLoading: boolean
  closeModal: () => void
  handleSubmit: (e: React.FormEvent) => void
}) {
  const scanInputRef = useRef<HTMLInputElement | null>(null)
  const hargaModalBaru = parseRupiahNumber(form.hargaModalBaru)
  const hargaJualBaru = parseRupiahNumber(form.hargaJualBaru)
  const kodeUnikList = getKodeUnikListFromText(form.kodeUnik)
  const isImeiRestok =
    !!selectedItem &&
    selectedItem.type === "barang" &&
    Boolean(selectedItem.pakaiKodeUnik) &&
    (selectedItem.jenisKodeUnik || "imei") === "imei"
  const jumlahTambahFinal = isImeiRestok ? kodeUnikList.length : Number(form.jumlahTambah || 0)
  const hargaBerubah =
    !!selectedItem &&
    selectedItem.type === "barang" &&
    !isImeiRestok &&
    (hargaModalBaru !== Number(selectedItem.hargaModal || 0) ||
      hargaJualBaru !== Number(selectedItem.hargaJual || 0))
  const previewVariant = selectedItem && selectedItem.type === "barang" && hargaBerubah
    ? buildAutoVariantCode(selectedItem.kodeRef, barangList)
    : null
  const previewVariantName =
    selectedItem && previewVariant ? buildAutoVariantName(selectedItem.nama, previewVariant.counter) : ""

  useEffect(() => {
    if (!show || !isImeiRestok) return

    const timer = window.setTimeout(() => {
      scanInputRef.current?.focus()
    }, 120)

    return () => window.clearTimeout(timer)
  }, [show, isImeiRestok])

  const addImeiToForm = (value: string) => {
    const kode = normalizeKodeUnik(value)
    if (!kode) return

    setForm((prev) => {
      const current = getKodeUnikListFromText(prev.kodeUnik)
      if (current.includes(kode)) return prev

      return {
        ...prev,
        kodeUnik: [...current, kode].join("\n"),
        jumlahTambah: String(current.length + 1),
      }
    })
  }

  const removeImeiFromForm = (kode: string) => {
    setForm((prev) => {
      const nextList = getKodeUnikListFromText(prev.kodeUnik).filter((item) => item !== kode)
      return {
        ...prev,
        kodeUnik: nextList.join("\n"),
        jumlahTambah: String(nextList.length),
      }
    })
    window.setTimeout(() => scanInputRef.current?.focus(), 60)
  }

  return (
    <AnimatePresence>
      {show && selectedItem && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
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
                  Pembelian {selectedItem.type === "saldo" ? "Saldo" : isImeiRestok ? "Barang IMEI" : "Barang"}
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
                  <ModalStat label={isImeiRestok ? "IMEI Baru" : "Kurang"} value={isImeiRestok ? String(kodeUnikList.length) : formatNilai(selectedItem, selectedItem.kekurangan)} tone="rose" />
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
                  {isImeiRestok ? (
                    <>
                      <div className="sm:col-span-2 rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Mode Scan IMEI Aktif</p>
                            <p className="mt-1 text-xs font-bold text-sky-700">
                             Setiap scan masuk ke daftar IMEI baru.
                            </p>
                          </div>
                          <span className="inline-flex rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-sky-700 ring-1 ring-sky-100">
                            {kodeUnikList.length} IMEI
                          </span>
                        </div>

                        <input
                          ref={scanInputRef}
                          className="pointer-events-none absolute h-px w-px opacity-0"
                          autoComplete="off"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              const target = e.target as HTMLInputElement
                              addImeiToForm(target.value)
                              target.value = ""
                            }
                          }}
                        />

                        <div className="mt-3">
                          <FormTextarea
                            label="Daftar IMEI Baru"
                            icon={Package}
                            value={form.kodeUnik}
                            onChange={(e: any) => {
                              const nextList = getKodeUnikListFromText(e.target.value)
                              setForm((prev) => ({
                                ...prev,
                                kodeUnik: nextList.join("\n"),
                                jumlahTambah: String(nextList.length),
                              }))
                            }}
                            placeholder="Scan IMEI atau paste banyak IMEI, satu baris satu IMEI."
                          />
                        </div>

                        {kodeUnikList.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {kodeUnikList.map((kode) => (
                              <button
                                key={kode}
                                type="button"
                                onClick={() => removeImeiFromForm(kode)}
                                className="inline-flex items-center gap-1 rounded-full border border-sky-100 bg-white px-2.5 py-1 text-[10px] font-black text-sky-700 shadow-sm"
                              >
                                {kode}
                                <X size={12} strokeWidth={2.5} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Jumlah Tambah</p>
                        <p className="mt-1 text-sm font-black text-sky-700">{kodeUnikList.length}</p>
                      </div>

                      <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Setelah Pembelian</p>
                        <p className="mt-1 text-sm font-black text-sky-700">
                          {formatNilai(selectedItem, Number(selectedItem.stokSekarang || 0) + kodeUnikList.length)}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}

                  {selectedItem.type === "barang" && (
                    <>
                      <FormInput
                        label="Harga Modal Baru"
                        required
                        icon={Coins}
                        inputMode="numeric"
                        value={form.hargaModalBaru}
                        onChange={(e: any) =>
                          setForm((prev) => ({
                            ...prev,
                            hargaModalBaru: formatNumberDots(e.target.value),
                          }))
                        }
                        placeholder="Contoh: 50.000"
                        rightSlot={
                          <span className="rounded-lg bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-600">
                            Lama {formatRupiah(selectedItem.hargaModal || 0)}
                          </span>
                        }
                      />

                      <FormInput
                        label="Harga Jual Baru"
                        required
                        icon={Tag}
                        inputMode="numeric"
                        value={form.hargaJualBaru}
                        onChange={(e: any) =>
                          setForm((prev) => ({
                            ...prev,
                            hargaJualBaru: formatNumberDots(e.target.value),
                          }))
                        }
                        placeholder="Contoh: 60.000"
                        rightSlot={
                          <span className="rounded-lg bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-600">
                            Lama {formatRupiah(selectedItem.hargaJual || 0)}
                          </span>
                        }
                      />

                      <div className="sm:col-span-2">
                        <FormSelect
                          label="Supplier"
                          icon={Truck}
                          value={form.supplier}
                          onChange={(e: any) =>
                            setForm((prev) => ({
                              ...prev,
                              supplier: e.target.value,
                            }))
                          }
                        >
                          <option value="">Pilih supplier</option>
                          {form.supplier && !supplierList.some((item) => item.nama === form.supplier) && (
                            <option value={form.supplier}>{form.supplier}</option>
                          )}
                          {supplierList.map((item) => (
                            <option key={item.id} value={item.nama}>
                              {item.nama}
                            </option>
                          ))}
                        </FormSelect>
                      </div>

                      <div className={`sm:col-span-2 rounded-2xl border px-3 py-2.5 ${
                        isImeiRestok
                          ? "border-sky-200 bg-sky-50"
                          : hargaBerubah
                            ? "border-amber-200 bg-amber-50"
                            : "border-sky-100 bg-sky-50/70"
                      }`}>
                        <p className={`text-[10px] font-black uppercase tracking-widest ${
                          isImeiRestok
                            ? "text-sky-700"
                            : hargaBerubah
                              ? "text-amber-700"
                              : "text-sky-600"
                        }`}>
                          {isImeiRestok
                            ? "Sistem Akan Membuat Unit IMEI Baru"
                            : hargaBerubah
                              ? "Sistem Akan Membuat Varian Baru"
                              : "Sistem Akan Menambah Stok Barang Ini"}
                        </p>
                        <p className={`mt-1 text-xs font-black ${
                          isImeiRestok
                            ? "text-sky-800"
                            : hargaBerubah
                              ? "text-amber-800"
                              : "text-sky-700"
                        }`}>
                          {isImeiRestok
                            ? `${kodeUnikList.length} unit baru · ${selectedItem.nama}`
                            : hargaBerubah
                              ? `${previewVariantName} · ${previewVariant?.code || "-"}`
                              : `${selectedItem.nama} · ${selectedItem.kodeRef}`}
                        </p>
                      </div>
                    </>
                  )}

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
                    disabled={submitLoading || (isImeiRestok && jumlahTambahFinal <= 0)}
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
