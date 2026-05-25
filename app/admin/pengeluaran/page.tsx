/*
  Halaman admin pengeluaran.
  Layout diseragamkan dengan Transfer Barang / Terima Barang: header biru muda,
  tab mobile ala Tambah Toko, filter collapse, toast fixed, pagination, input berbasis bulan, copy bulanan per toko, dan update local state tanpa reload penuh.
*/

"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { auth, db } from "@/lib/firebase"
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore"
import {
  AlertCircle,
  ArrowRightLeft,
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Copy,
  FileText,
  ListFilter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Store,
  Tags,
  Trash2,
  Wallet,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

type Toko = {
  id: string
  nama: string
  aktif?: boolean
}

type KategoriPengeluaran = {
  id: string
  nama: string
  namaLower: string
  deskripsi: string
  aktif: boolean
  createdAtMs: number
}

type Pengeluaran = {
  id: string
  tanggal: string
  tanggalKey: string
  bulanKey: string
  tokoId: string
  tokoNama: string
  kategoriId: string
  kategoriNama: string
  nominal: number
  catatan: string
  createdAtMs: number
}

type ActiveTab = "input" | "riwayat" | "kategori"

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 0, label: "ALL" },
]

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatBulanKey(value?: string) {
  if (!value) return "-"
  const [year, month] = String(value).split("-")
  const y = Number(year || 0)
  const m = Number(month || 0)
  if (!y || !m) return value

  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1))
}

function getMonthInputValue(date = new Date()) {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, "0")
  return `${y}-${m}`
}

function getNextMonthInputValue(date = new Date()) {
  return getMonthInputValue(new Date(date.getFullYear(), date.getMonth() + 1, 1))
}

function getLastDayOfMonth(year: number, monthIndexZeroBased: number) {
  return new Date(year, monthIndexZeroBased + 1, 0).getDate()
}

function copyDateToTargetMonth(sourceDate: string, targetMonth: string) {
  const [, , sourceDayRaw] = String(sourceDate || "").split("-")
  const [targetYearRaw, targetMonthRaw] = String(targetMonth || "").split("-")
  const targetYear = Number(targetYearRaw || 0)
  const targetMonthNumber = Number(targetMonthRaw || 0)

  if (!targetYear || !targetMonthNumber) return `${targetMonth}-01`

  const sourceDay = Number(sourceDayRaw || 1) || 1
  const lastDay = getLastDayOfMonth(targetYear, targetMonthNumber - 1)
  const safeDay = Math.min(Math.max(sourceDay, 1), lastDay)

  return `${targetMonth}-${String(safeDay).padStart(2, "0")}`
}

function toNumberOnly(value: string) {
  return Number(String(value || "").replace(/[^\d]/g, "") || 0)
}

function InputLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
      {children}
    </label>
  )
}

function FilterSelect({
  value,
  onChange,
  children,
  label,
  icon: Icon,
  disabled,
}: {
  value: string | number
  onChange: (value: string) => void
  children: ReactNode
  label: string
  icon?: any
  disabled?: boolean
}) {
  return (
    <div>
      <InputLabel>{label}</InputLabel>
      <div className="relative">
        {Icon ? (
          <Icon
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            strokeWidth={2}
          />
        ) : null}

        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white ${
            Icon ? "pl-8" : "pl-3"
          } pr-8 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20 disabled:cursor-not-allowed disabled:bg-slate-100`}
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

function TextInput({
  label,
  icon: Icon,
  className = "",
  ...props
}: {
  label: string
  icon?: any
  className?: string
  [key: string]: any
}) {
  return (
    <div className={className}>
      <InputLabel>{label}</InputLabel>
      <div className="relative">
        {Icon ? (
          <Icon
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            strokeWidth={2}
          />
        ) : null}
        <input
          {...props}
          className={`w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 ${
            Icon ? "pl-8" : "pl-3"
          } pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20`}
        />
      </div>
    </div>
  )
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: any
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-wide transition sm:text-xs ${
        active
          ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-lg shadow-sky-500/15"
          : "border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon size={15} strokeWidth={2.5} />
      {label}
    </button>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string | number
  icon: any
  tone: "slate" | "sky" | "blue"
}) {
  const cls =
    tone === "sky"
      ? "bg-sky-50 text-sky-600"
      : tone === "blue"
        ? "bg-blue-50 text-blue-600"
        : "bg-slate-100 text-slate-500"

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4">
      <div className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left">
        <div className={`hidden h-9 w-9 items-center justify-center rounded-2xl sm:flex sm:h-11 sm:w-11 ${cls}`}>
          <Icon size={18} strokeWidth={2.5} className="sm:h-[21px] sm:w-[21px]" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[10px] sm:tracking-widest">
            {label}
          </p>
          <p className="truncate text-base font-black leading-tight text-slate-800 sm:text-2xl">
            {value}
          </p>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-black text-slate-800 sm:text-base">{title}</h2>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {subtitle}
      </p>
    </div>
  )
}

export default function PengeluaranPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("input")
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)

  const [loadingPage, setLoadingPage] = useState(false)
  const [savingPengeluaran, setSavingPengeluaran] = useState(false)
  const [savingKategori, setSavingKategori] = useState(false)
  const [deletingId, setDeletingId] = useState("")
  const [deletingKategoriId, setDeletingKategoriId] = useState("")
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriPengeluaran[]>([])
  const [pengeluaranList, setPengeluaranList] = useState<Pengeluaran[]>([])

  const [bulanPengeluaran, setBulanPengeluaran] = useState(getMonthInputValue())
  const [tokoId, setTokoId] = useState("")
  const [kategoriId, setKategoriId] = useState("")
  const [nominalInput, setNominalInput] = useState("")
  const [catatan, setCatatan] = useState("")

  const [kategoriBaruNama, setKategoriBaruNama] = useState("")
  const [kategoriBaruDeskripsi, setKategoriBaruDeskripsi] = useState("")

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterKategori, setFilterKategori] = useState("")
  const [filterBulan, setFilterBulan] = useState(getMonthInputValue())
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const [copyTokoId, setCopyTokoId] = useState("")
  const [copySourceBulan, setCopySourceBulan] = useState(getMonthInputValue())
  const [copyTargetBulan, setCopyTargetBulan] = useState(getNextMonthInputValue())
  const [copyingMonthly, setCopyingMonthly] = useState(false)

  const showSuccess = (message: string) => {
    setSuccessMsg(message)
    setErrorMsg(null)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  const showError = (message: string) => {
    setErrorMsg(message)
    setSuccessMsg(null)
    setTimeout(() => setErrorMsg(null), 3500)
  }

  const fetchAll = async () => {
    setLoadingPage(true)
    setErrorMsg(null)

    try {
      const [tokoSnap, kategoriSnap, pengeluaranSnap] = await Promise.all([
        getDocs(query(collection(db, "toko"), orderBy("nama"))),
        getDocs(query(collection(db, "kategori_pengeluaran"), orderBy("nama"))),
        getDocs(query(collection(db, "pengeluaran"), orderBy("createdAtMs", "desc"))),
      ])

      const tokoData: Toko[] = tokoSnap.docs.map((item) => {
        const data = item.data() as any
        return {
          id: item.id,
          nama: String(data?.nama || ""),
          aktif: data?.aktif !== false,
        }
      })

      const kategoriData: KategoriPengeluaran[] = kategoriSnap.docs.map((item) => {
        const data = item.data() as any
        return {
          id: item.id,
          nama: String(data?.nama || ""),
          namaLower: String(data?.namaLower || ""),
          deskripsi: String(data?.deskripsi || ""),
          aktif: data?.aktif !== false,
          createdAtMs: Number(data?.createdAtMs || 0),
        }
      })

      const pengeluaranData: Pengeluaran[] = pengeluaranSnap.docs.map((item) => {
        const data = item.data() as any
        return {
          id: item.id,
          tanggal: String(data?.tanggal || ""),
          tanggalKey: String(data?.tanggalKey || ""),
          bulanKey: String(data?.bulanKey || ""),
          tokoId: String(data?.tokoId || ""),
          tokoNama: String(data?.tokoNama || ""),
          kategoriId: String(data?.kategoriId || ""),
          kategoriNama: String(data?.kategoriNama || ""),
          nominal: Number(data?.nominal || 0),
          catatan: String(data?.catatan || ""),
          createdAtMs: Number(data?.createdAtMs || 0),
        }
      })

      const tokoAktif = tokoData.filter((item) => item.nama && item.aktif !== false)
      const kategoriAktif = kategoriData.filter((item) => item.nama && item.aktif !== false)

      setTokoList(tokoAktif)
      setKategoriList(kategoriAktif)
      setPengeluaranList(pengeluaranData)

      if (!tokoId && tokoAktif.length > 0) setTokoId(tokoAktif[0].id)
      if (!copyTokoId && tokoAktif.length > 0) setCopyTokoId(tokoAktif[0].id)
      if (!kategoriId && kategoriAktif.length > 0) setKategoriId(kategoriAktif[0].id)
    } catch (err) {
      console.error(err)
      showError("Gagal memuat data pengeluaran")
      setTokoList([])
      setKategoriList([])
      setPengeluaranList([])
    } finally {
      setLoadingPage(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) await fetchAll()
      else setLoadingPage(false)
    })

    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const kategoriSelected = useMemo(
    () => kategoriList.find((item) => item.id === kategoriId) || null,
    [kategoriId, kategoriList]
  )

  const tokoSelected = useMemo(
    () => tokoList.find((item) => item.id === tokoId) || null,
    [tokoId, tokoList]
  )

  const copyTokoSelected = useMemo(
    () => tokoList.find((item) => item.id === copyTokoId) || null,
    [copyTokoId, tokoList]
  )

  const copySourcePengeluaran = useMemo(() => {
    if (!copyTokoId || !copySourceBulan) return []
    return pengeluaranList.filter(
      (item) => item.tokoId === copyTokoId && item.bulanKey === copySourceBulan
    )
  }, [pengeluaranList, copyTokoId, copySourceBulan])

  const copyTargetPengeluaran = useMemo(() => {
    if (!copyTokoId || !copyTargetBulan) return []
    return pengeluaranList.filter(
      (item) => item.tokoId === copyTokoId && item.bulanKey === copyTargetBulan
    )
  }, [pengeluaranList, copyTokoId, copyTargetBulan])

  const copySourceTotal = useMemo(
    () => copySourcePengeluaran.reduce((acc, item) => acc + Number(item.nominal || 0), 0),
    [copySourcePengeluaran]
  )

  const filteredPengeluaran = useMemo(() => {
    const q = search.toLowerCase().trim()

    return pengeluaranList.filter((item) => {
      const matchSearch =
        !q ||
        item.kategoriNama.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.catatan.toLowerCase().includes(q) ||
        item.tanggalKey.toLowerCase().includes(q)

      const matchToko = !filterToko || item.tokoId === filterToko
      const matchKategori = !filterKategori || item.kategoriId === filterKategori
      const matchBulan = !filterBulan || item.bulanKey === filterBulan

      return matchSearch && matchToko && matchKategori && matchBulan
    })
  }, [pengeluaranList, search, filterToko, filterKategori, filterBulan])

  const totalPages =
    itemsPerPage === 0
      ? 1
      : Math.max(1, Math.ceil(filteredPengeluaran.length / itemsPerPage))

  const pagedPengeluaran =
    itemsPerPage === 0
      ? filteredPengeluaran
      : filteredPengeluaran.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const goPage = (value: number) => setPage(Math.max(1, Math.min(totalPages, value)))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const totalPengeluaran = filteredPengeluaran.reduce(
    (acc, item) => acc + Number(item.nominal || 0),
    0
  )

  const totalTransaksiPengeluaran = filteredPengeluaran.length

  const kategoriBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { kategoriId: string; kategoriNama: string; total: number; jumlah: number }
    >()

    for (const item of filteredPengeluaran) {
      const key = item.kategoriId || item.kategoriNama || item.id
      const current = map.get(key) || {
        kategoriId: item.kategoriId,
        kategoriNama: item.kategoriNama || "Tanpa Kategori",
        total: 0,
        jumlah: 0,
      }

      current.total += Number(item.nominal || 0)
      current.jumlah += 1
      map.set(key, current)
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [filteredPengeluaran])

  const totalKategoriAktif = kategoriList.length
  const totalTokoTerlibat = new Set(filteredPengeluaran.map((item) => item.tokoId)).size

  const resetFilter = () => {
    setSearch("")
    setFilterToko("")
    setFilterKategori("")
    setFilterBulan(getMonthInputValue())
    setPage(1)
  }

  const handleTambahKategori = async () => {
    const nama = kategoriBaruNama.trim()
    const deskripsi = kategoriBaruDeskripsi.trim()

    if (!nama) {
      showError("Nama kategori wajib diisi")
      return
    }

    const namaLower = nama.toLowerCase()
    const isExist = kategoriList.some((item) => item.namaLower === namaLower)

    if (isExist) {
      showError("Kategori sudah ada")
      return
    }

    try {
      setSavingKategori(true)
      const now = Date.now()

      const ref = await addDoc(collection(db, "kategori_pengeluaran"), {
        nama,
        namaLower,
        deskripsi,
        aktif: true,
        createdAtMs: now,
        updatedAtMs: now,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      const newKategori: KategoriPengeluaran = {
        id: ref.id,
        nama,
        namaLower,
        deskripsi,
        aktif: true,
        createdAtMs: now,
      }

      setKategoriList((prev) =>
        [newKategori, ...prev].sort((a, b) => a.nama.localeCompare(b.nama, "id"))
      )
      if (!kategoriId) setKategoriId(ref.id)
      setKategoriBaruNama("")
      setKategoriBaruDeskripsi("")
      showSuccess("Kategori berhasil ditambahkan")
    } catch (err) {
      console.error(err)
      showError("Gagal menambah kategori")
    } finally {
      setSavingKategori(false)
    }
  }

  const handleTambahPengeluaran = async () => {
    const nominal = toNumberOnly(nominalInput)

    if (!bulanPengeluaran) {
      showError("Bulan pengeluaran wajib diisi")
      return
    }

    if (!tokoSelected) {
      showError("Toko wajib dipilih")
      return
    }

    if (!kategoriSelected) {
      showError("Kategori wajib dipilih")
      return
    }

    if (!nominal || nominal <= 0) {
      showError("Nominal pengeluaran wajib diisi")
      return
    }

    try {
      setSavingPengeluaran(true)
      const now = Date.now()
      const bulanKey = bulanPengeluaran
      const tanggalKey = `${bulanKey}-01`
      const payload = {
        tanggal: tanggalKey,
        tanggalKey,
        bulanKey,
        tokoId: tokoSelected.id,
        tokoNama: tokoSelected.nama,
        kategoriId: kategoriSelected.id,
        kategoriNama: kategoriSelected.nama,
        nominal,
        catatan: catatan.trim(),
        createdAtMs: now,
        updatedAtMs: now,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      const ref = await addDoc(collection(db, "pengeluaran"), payload)
      const newItem: Pengeluaran = { id: ref.id, ...payload }

      setPengeluaranList((prev) => [newItem, ...prev].sort((a, b) => b.createdAtMs - a.createdAtMs))
      setNominalInput("")
      setCatatan("")
      setFilterBulan(bulanKey)
      setActiveTab("riwayat")
      showSuccess("Pengeluaran berhasil ditambahkan")
    } catch (err) {
      console.error(err)
      showError("Gagal menambah pengeluaran")
    } finally {
      setSavingPengeluaran(false)
    }
  }

  const handleCopyPengeluaranBulanan = async () => {
    if (!copyTokoSelected) {
      showError("Pilih toko yang mau dicopy")
      return
    }

    if (!copySourceBulan) {
      showError("Pilih bulan sumber")
      return
    }

    if (!copyTargetBulan) {
      showError("Pilih bulan tujuan")
      return
    }

    if (copySourceBulan === copyTargetBulan) {
      showError("Bulan sumber dan bulan tujuan tidak boleh sama")
      return
    }

    if (copySourcePengeluaran.length === 0) {
      showError("Tidak ada pengeluaran di bulan sumber untuk toko ini")
      return
    }

    if (copyTargetPengeluaran.length > 0) {
      showError("Bulan tujuan sudah punya data untuk toko ini, agar tidak dobel")
      return
    }

    try {
      setCopyingMonthly(true)
      const now = Date.now()

      const newItems = await Promise.all(
        copySourcePengeluaran.map(async (item, index) => {
          const tanggalBaru = copyDateToTargetMonth(item.tanggalKey || item.tanggal, copyTargetBulan)
          const createdAtMs = now + index
          const payload = {
            tanggal: tanggalBaru,
            tanggalKey: tanggalBaru,
            bulanKey: copyTargetBulan,
            tokoId: copyTokoSelected.id,
            tokoNama: copyTokoSelected.nama,
            kategoriId: item.kategoriId,
            kategoriNama: item.kategoriNama,
            nominal: Number(item.nominal || 0),
            catatan: item.catatan || "",
            createdAtMs,
            updatedAtMs: createdAtMs,
            copiedFromPengeluaranId: item.id,
            copiedFromBulanKey: item.bulanKey,
            copiedFromTokoId: item.tokoId,
            copiedAtMs: now,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }

          const ref = await addDoc(collection(db, "pengeluaran"), payload)
          return {
            id: ref.id,
            tanggal: payload.tanggal,
            tanggalKey: payload.tanggalKey,
            bulanKey: payload.bulanKey,
            tokoId: payload.tokoId,
            tokoNama: payload.tokoNama,
            kategoriId: payload.kategoriId,
            kategoriNama: payload.kategoriNama,
            nominal: payload.nominal,
            catatan: payload.catatan,
            createdAtMs: payload.createdAtMs,
          } as Pengeluaran
        })
      )

      setPengeluaranList((prev) =>
        [...newItems, ...prev].sort((a, b) => b.createdAtMs - a.createdAtMs)
      )
      setFilterToko(copyTokoSelected.id)
      setFilterBulan(copyTargetBulan)
      setFilterKategori("")
      setSearch("")
      setPage(1)
      setActiveTab("riwayat")
      showSuccess(`${newItems.length} pengeluaran berhasil dicopy ke ${formatBulanKey(copyTargetBulan)}`)
    } catch (err) {
      console.error(err)
      showError("Gagal copy pengeluaran bulanan")
    } finally {
      setCopyingMonthly(false)
    }
  }

  const handleDeletePengeluaran = async (id: string) => {
    const ok = window.confirm("Hapus data pengeluaran ini?")
    if (!ok) return

    try {
      setDeletingId(id)
      await deleteDoc(doc(db, "pengeluaran", id))
      setPengeluaranList((prev) => prev.filter((item) => item.id !== id))
      showSuccess("Pengeluaran berhasil dihapus")
    } catch (err) {
      console.error(err)
      showError("Gagal menghapus pengeluaran")
    } finally {
      setDeletingId("")
    }
  }

  const handleDeleteKategori = async (id: string, nama: string) => {
    const masihDipakai = pengeluaranList.some((item) => item.kategoriId === id)
    if (masihDipakai) {
      showError(`Kategori "${nama}" sudah dipakai di data pengeluaran`)
      return
    }

    const ok = window.confirm(`Hapus kategori "${nama}"?`)
    if (!ok) return

    try {
      setDeletingKategoriId(id)
      await deleteDoc(doc(db, "kategori_pengeluaran", id))
      setKategoriList((prev) => prev.filter((item) => item.id !== id))
      if (kategoriId === id) setKategoriId("")
      if (filterKategori === id) setFilterKategori("")
      showSuccess("Kategori berhasil dihapus")
    } catch (err) {
      console.error(err)
      showError("Gagal menghapus kategori")
    } finally {
      setDeletingKategoriId("")
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
                <Wallet size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Pengeluaran
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Catat pengeluaran toko, kelola kategori, dan pantau rekap operasional.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={fetchAll}
                disabled={loadingPage}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15 disabled:opacity-60"
                title="Refresh"
              >
                <RefreshCw
                  size={12}
                  strokeWidth={2.8}
                  className={loadingPage ? "animate-spin" : ""}
                />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.04]">
            <Cpu size={150} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        <AnimatePresence>
          {(successMsg || errorMsg) && (
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
                {successMsg || errorMsg}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSuccessMsg(null)
                  setErrorMsg(null)
                }}
                className={successMsg ? "text-sky-600" : "text-red-600"}
              >
                <X size={13} strokeWidth={3} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:hidden"
        >
          <div className="grid grid-cols-3 gap-2">
            <TabButton
              active={activeTab === "input"}
              icon={Plus}
              label="Input"
              onClick={() => setActiveTab("input")}
            />
            <TabButton
              active={activeTab === "riwayat"}
              icon={FileText}
              label="Riwayat"
              onClick={() => setActiveTab("riwayat")}
            />
            <TabButton
              active={activeTab === "kategori"}
              icon={Tags}
              label="Kategori"
              onClick={() => setActiveTab("kategori")}
            />
          </div>
        </motion.div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatCard
            label="Total"
            value={formatRupiah(totalPengeluaran)}
            icon={Wallet}
            tone="slate"
          />
          <StatCard
            label="Transaksi"
            value={totalTransaksiPengeluaran}
            icon={FileText}
            tone="sky"
          />
          <StatCard
            label="Kategori"
            value={totalKategoriAktif}
            icon={Tags}
            tone="blue"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className={`space-y-4 xl:col-span-7 ${activeTab !== "input" ? "hidden sm:block" : ""}`}
          >
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <SectionTitle
                title="Tambah Pengeluaran"
                subtitle=""
              />

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <TextInput
                  label="Bulan Pengeluaran"
                  icon={CalendarDays}
                  type="month"
                  value={bulanPengeluaran}
                  onChange={(e: any) => setBulanPengeluaran(e.target.value)}
                />

                <FilterSelect
                  label="Toko"
                  value={tokoId}
                  onChange={setTokoId}
                  icon={Store}
                  disabled={tokoList.length === 0}
                >
                  <option value="">Pilih toko</option>
                  {tokoList.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nama}
                    </option>
                  ))}
                </FilterSelect>

                <FilterSelect
                  label="Kategori Pengeluaran"
                  value={kategoriId}
                  onChange={setKategoriId}
                  icon={Tags}
                  disabled={kategoriList.length === 0}
                >
                  <option value="">Pilih kategori</option>
                  {kategoriList.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nama}
                    </option>
                  ))}
                </FilterSelect>

                <div>
                  <TextInput
                    label="Nominal"
                    icon={BadgeDollarSign}
                    inputMode="numeric"
                    value={nominalInput}
                    onChange={(e: any) => {
                      const angka = toNumberOnly(e.target.value)
                      setNominalInput(angka ? String(angka) : "")
                    }}
                    placeholder="Contoh: 500000"
                  />
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    {formatRupiah(toNumberOnly(nominalInput))}
                  </p>
                </div>

                <div className="md:col-span-2">
                  <InputLabel>Catatan</InputLabel>
                  <textarea
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    rows={3}
                    placeholder="Contoh: bayar listrik toko pusat bulan ini"
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleTambahPengeluaran}
                  disabled={savingPengeluaran}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-2.5 text-sm font-black text-white shadow-sm shadow-sky-500/15 transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingPengeluaran ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Plus size={16} />
                  )}
                  Simpan Pengeluaran
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBulanPengeluaran(getMonthInputValue())
                    setNominalInput("")
                    setCatatan("")
                  }}
                  disabled={savingPengeluaran}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-black text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-60"
                >
                  Reset Form
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <SectionTitle
                title="Copy Pengeluaran Bulanan"
                subtitle=""
              />

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <FilterSelect
                  label="Toko"
                  value={copyTokoId}
                  onChange={setCopyTokoId}
                  icon={Store}
                  disabled={tokoList.length === 0 || copyingMonthly}
                >
                  <option value="">Pilih toko</option>
                  {tokoList.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nama}
                    </option>
                  ))}
                </FilterSelect>

                <TextInput
                  label="Bulan Sumber"
                  icon={CalendarDays}
                  type="month"
                  value={copySourceBulan}
                  onChange={(e: any) => setCopySourceBulan(e.target.value)}
                  disabled={copyingMonthly}
                />

                <TextInput
                  label="Bulan Tujuan"
                  icon={ArrowRightLeft}
                  type="month"
                  value={copyTargetBulan}
                  onChange={(e: any) => setCopyTargetBulan(e.target.value)}
                  disabled={copyingMonthly}
                />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Bulan Sumber
                  </p>
                  <p className="mt-1 text-sm font-black text-slate-800">
                    {copySourcePengeluaran.length} data
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                    {formatRupiah(copySourceTotal)}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Bulan Tujuan
                  </p>
                  <p className={`mt-1 text-sm font-black ${copyTargetPengeluaran.length > 0 ? "text-red-600" : "text-slate-800"}`}>
                    {copyTargetPengeluaran.length} data
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                    {copyTargetPengeluaran.length > 0 ? "Sudah terisi" : "Aman dicopy"}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Toko
                  </p>
                  <p className="mt-1 truncate text-sm font-black text-slate-800">
                    {copyTokoSelected?.nama || "Belum dipilih"}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                    Copy hanya untuk toko ini
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopyPengeluaranBulanan}
                  disabled={copyingMonthly}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-2.5 text-sm font-black text-white shadow-sm shadow-sky-500/15 transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {copyingMonthly ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Copy size={16} />
                  )}
                  Copy ke Bulan Tujuan
                </button>
               
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className={`space-y-4 xl:col-span-5 ${activeTab !== "kategori" ? "hidden sm:block" : ""}`}
          >
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <SectionTitle
                title="Tambah Kategori"
                subtitle=""
              />

              <div className="space-y-3">
                <TextInput
                  label="Nama Kategori"
                  value={kategoriBaruNama}
                  onChange={(e: any) => setKategoriBaruNama(e.target.value)}
                  placeholder="Contoh: Gaji Karyawan"
                />

                <div>
                  <InputLabel>Deskripsi</InputLabel>
                  <textarea
                    value={kategoriBaruDeskripsi}
                    onChange={(e) => setKategoriBaruDeskripsi(e.target.value)}
                    rows={3}
                    placeholder="Opsional"
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleTambahKategori}
                  disabled={savingKategori}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-2.5 text-sm font-black text-white shadow-sm shadow-sky-500/15 transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingKategori ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Plus size={16} />
                  )}
                  Tambah Kategori
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <SectionTitle
                title="Breakdown Kategori"
                subtitle="Total pengeluaran per kategori"
              />

              {kategoriBreakdown.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  Belum ada data
                </div>
              ) : (
                <div className="space-y-3">
                  {kategoriBreakdown.map((item) => {
                    const persen = totalPengeluaran > 0 ? (item.total / totalPengeluaran) * 100 : 0

                    return (
                      <div
                        key={item.kategoriId || item.kategoriNama}
                        className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-800">
                              {item.kategoriNama}
                            </p>
                            <p className="mt-1 text-[11px] font-semibold text-slate-500">
                              {item.jumlah} data
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-sm font-black text-slate-800">
                              {formatRupiah(item.total)}
                            </p>
                            <p className="mt-1 text-[10px] font-bold text-slate-500">
                              {persen.toFixed(1)}%
                            </p>
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500"
                              style={{ width: `${Math.min(100, persen)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <SectionTitle title="Master Kategori" subtitle="Daftar kategori yang tersedia" />

              {kategoriList.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  Belum ada kategori
                </div>
              ) : (
                <div className="space-y-3">
                  {kategoriList.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-800">{item.nama}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {item.deskripsi || "Tanpa deskripsi"}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteKategori(item.id, item.nama)}
                          disabled={deletingKategoriId === item.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-[11px] font-black text-red-600 transition-all hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingKategoriId === item.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                          Hapus
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`${activeTab !== "riwayat" ? "hidden sm:block" : ""}`}
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <SectionTitle title="Riwayat Pengeluaran" subtitle="Daftar pengeluaran yang sudah diinput" />

              <div className="hidden w-full sm:block sm:w-40">
                <FilterSelect
                  label="Tampil"
                  value={itemsPerPage}
                  onChange={(v) => {
                    setItemsPerPage(Number(v))
                    setPage(1)
                  }}
                >
                  {ITEMS_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </FilterSelect>
              </div>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2 sm:hidden">
              <button
                type="button"
                onClick={() => setFilterMobileOpen((prev) => !prev)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.08em] transition ${
                  filterMobileOpen
                    ? "border-sky-200 bg-sky-100 text-sky-700"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                <ListFilter size={14} strokeWidth={2.5} />
                Filter
              </button>

              <button
                type="button"
                onClick={fetchAll}
                disabled={loadingPage}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.08em] text-sky-700 disabled:opacity-60"
              >
                <RefreshCw size={14} strokeWidth={2.5} className={loadingPage ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>

            <div className="hidden sm:block">
              <FilterPanel
                search={search}
                setSearch={(value) => {
                  setSearch(value)
                  setPage(1)
                }}
                filterToko={filterToko}
                setFilterToko={(value) => {
                  setFilterToko(value)
                  setPage(1)
                }}
                filterKategori={filterKategori}
                setFilterKategori={(value) => {
                  setFilterKategori(value)
                  setPage(1)
                }}
                filterBulan={filterBulan}
                setFilterBulan={(value) => {
                  setFilterBulan(value)
                  setPage(1)
                }}
                tokoList={tokoList}
                kategoriList={kategoriList}
                resetFilter={resetFilter}
              />
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
                  <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                    <FilterPanel
                      search={search}
                      setSearch={(value) => {
                        setSearch(value)
                        setPage(1)
                      }}
                      filterToko={filterToko}
                      setFilterToko={(value) => {
                        setFilterToko(value)
                        setPage(1)
                      }}
                      filterKategori={filterKategori}
                      setFilterKategori={(value) => {
                        setFilterKategori(value)
                        setPage(1)
                      }}
                      filterBulan={filterBulan}
                      setFilterBulan={(value) => {
                        setFilterBulan(value)
                        setPage(1)
                      }}
                      tokoList={tokoList}
                      kategoriList={kategoriList}
                      resetFilter={resetFilter}
                      itemsPerPage={itemsPerPage}
                      setItemsPerPage={(value) => {
                        setItemsPerPage(value)
                        setPage(1)
                      }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                label="Toko"
                value={totalTokoTerlibat}
                icon={Store}
                tone="slate"
              />
              <StatCard
                label="Bulan"
                value={filterBulan ? formatBulanKey(filterBulan) : "Semua"}
                icon={CalendarDays}
                tone="sky"
              />
              <StatCard
                label="Total Filter"
                value={formatRupiah(totalPengeluaran)}
                icon={BadgeDollarSign}
                tone="blue"
              />
            </div>

            {loadingPage ? (
              <div className="flex justify-center py-16">
                <div className="flex flex-col items-center gap-3">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
                  />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Memuat data...
                  </p>
                </div>
              </div>
            ) : pagedPengeluaran.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-3">
                {pagedPengeluaran.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-sky-700">
                            {item.kategoriNama || "Tanpa Kategori"}
                          </span>
                          <span className="inline-flex rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                            {formatBulanKey(item.bulanKey)}
                          </span>
                        </div>

                        <p className="mt-3 text-sm font-black text-slate-800">
                          {formatRupiah(item.nominal)}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          {formatBulanKey(item.bulanKey)} • {item.tokoNama || "Tanpa Toko"}
                        </p>

                        {item.catatan ? (
                          <p className="mt-2 text-[12px] font-semibold text-slate-600">
                            {item.catatan}
                          </p>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeletePengeluaran(item.id)}
                        disabled={deletingId === item.id}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-[11px] font-black text-red-600 transition-all hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:self-start"
                      >
                        {deletingId === item.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                        Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {itemsPerPage !== 0 && totalPages > 1 && (
              <div className="mt-4 flex justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => goPage(page - 1)}
                  disabled={page === 1}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeft size={14} strokeWidth={2.5} />
                </button>

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
          </div>
        </motion.div>
      </main>
    </div>
  )
}

function FilterPanel({
  search,
  setSearch,
  filterToko,
  setFilterToko,
  filterKategori,
  setFilterKategori,
  filterBulan,
  setFilterBulan,
  tokoList,
  kategoriList,
  resetFilter,
  itemsPerPage,
  setItemsPerPage,
}: {
  search: string
  setSearch: (value: string) => void
  filterToko: string
  setFilterToko: (value: string) => void
  filterKategori: string
  setFilterKategori: (value: string) => void
  filterBulan: string
  setFilterBulan: (value: string) => void
  tokoList: Toko[]
  kategoriList: KategoriPengeluaran[]
  resetFilter: () => void
  itemsPerPage?: number
  setItemsPerPage?: (value: number) => void
}) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
      <TextInput
        label="Cari"
        icon={Search}
        value={search}
        onChange={(e: any) => setSearch(e.target.value)}
        placeholder="Kategori, toko, bulan, catatan..."
        className="xl:col-span-2"
      />

      <FilterSelect label="Toko" value={filterToko} onChange={setFilterToko} icon={Store}>
        <option value="">Semua toko</option>
        {tokoList.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nama}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Kategori"
        value={filterKategori}
        onChange={setFilterKategori}
        icon={Tags}
      >
        <option value="">Semua kategori</option>
        {kategoriList.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nama}
          </option>
        ))}
      </FilterSelect>

      <TextInput
        label="Bulan"
        icon={CalendarDays}
        type="month"
        value={filterBulan}
        onChange={(e: any) => setFilterBulan(e.target.value)}
      />

      {typeof itemsPerPage === "number" && setItemsPerPage ? (
        <FilterSelect
          label="Tampil"
          value={itemsPerPage}
          onChange={(value) => setItemsPerPage(Number(value))}
        >
          {ITEMS_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </FilterSelect>
      ) : null}

      <div className="flex items-end">
        <button
          type="button"
          onClick={resetFilter}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
        >
          Reset Filter
        </button>
      </div>
    </div>
  )
}
