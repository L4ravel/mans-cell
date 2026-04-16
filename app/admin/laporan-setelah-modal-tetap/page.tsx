/*
  Halaman admin laporan sisa keuntungan setelah modal tetap.
  File ini membaca koleksi laporan_bulanan, pengeluaran, dan laporan_barang_tetap
  untuk menampilkan keuntungan bersih operasional, total modal tetap,
  lalu menghitung sisa setelah modal tetap.

  Catatan:
  - keuntungan bersih operasional tetap dihitung dari laporan_bulanan - pengeluaran
  - modal tetap diambil dari snapshot koleksi laporan_barang_tetap saat ini
  - chart memakai akumulasi keuntungan bersih per bulan lalu dikurangi modal tetap satu kali
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, getDocs, orderBy, query } from "firebase/firestore"
import {
  AlertCircle,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Landmark,
  Package,
  ReceiptText,
  RefreshCw,
  Search,
  Store,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { motion } from "framer-motion"

type Toko = {
  id: string
  nama: string
  aktif?: boolean
}

type KategoriBreakdown = {
  kategoriId: string
  kategoriNama: string
  jumlahTransaksi: number
  qtyTerjual: number
  omzet: number
  subtotal: number
  totalDiskon: number
  totalSetelahDiskon: number
  totalModal: number
  totalBiayaAdmin: number
  labaKotor: number
  labaBersih: number
}

type LaporanBulanan = {
  id: string
  bulanKey: string
  tokoId: string
  tokoNama: string
  totalLabaKotor: number
  totalKeuntunganBersih: number
  omzet: number
  jumlahTransaksi: number
  kategoriBreakdown: KategoriBreakdown[]
}

type Pengeluaran = {
  id: string
  bulanKey: string
  tokoId: string
  tokoNama: string
  kategoriId: string
  kategoriNama: string
  nominal: number
}

type LaporanBarangTetapKategori = {
  kategoriId: string
  kategoriNama: string
  jumlahAset: number
  totalNilai: number
}

type LaporanBarangTetap = {
  id: string
  tokoId: string
  tokoNama: string
  jumlahAset: number
  totalNilai: number
  kategoriBreakdown: LaporanBarangTetapKategori[]
  updatedAtMs?: number
}

type RekapOperasional = {
  bulanKey: string
  tokoId: string
  tokoNama: string
  penghasilanKotor: number
  pengeluaran: number
  keuntunganBersih: number
  omzet: number
  jumlahTransaksi: number
  jumlahQtyTerjual: number
  jumlahDataPengeluaran: number
}

type RekapSetelahModal = {
  tokoId: string
  tokoNama: string
  keuntunganBersih: number
  modalTetap: number
  sisaSetelahModal: number
  omzet: number
  jumlahTransaksi: number
  jumlahQtyTerjual: number
  jumlahDataPengeluaran: number
  jumlahAset: number
}

type KategoriAsetOption = {
  id: string
  nama: string
}

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

function toMonthInputValue(date: Date) {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, "0")
  return `${y}-${m}`
}

function getStartOfYearMonthInput() {
  const now = new Date()
  return `${now.getFullYear()}-01`
}

function InfoCard({
  icon: Icon,
  label,
  value,
  subValue,
}: {
  icon: any
  label: string
  value: string
  subValue?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-white shadow-sm">
          <Icon size={18} strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
            {label}
          </p>
          <p className="mt-1 truncate text-lg font-black text-slate-800">{value}</p>
          {subValue ? (
            <p className="mt-1 text-[11px] font-semibold text-slate-500">{subValue}</p>
          ) : null}
        </div>
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
  value: string
  onChange: (value: string) => void
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

export default function LaporanSetelahModalTetapPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [laporanBulananList, setLaporanBulananList] = useState<LaporanBulanan[]>([])
  const [pengeluaranList, setPengeluaranList] = useState<Pengeluaran[]>([])
  const [laporanBarangTetapList, setLaporanBarangTetapList] = useState<LaporanBarangTetap[]>([])

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterKategoriAset, setFilterKategoriAset] = useState("")
  const [bulanMulai, setBulanMulai] = useState(getStartOfYearMonthInput())
  const [bulanSelesai, setBulanSelesai] = useState(toMonthInputValue(new Date()))

  const fetchAll = async () => {
    setLoading(true)
    setError(null)

    try {
      const [tokoSnap, laporanSnap, pengeluaranSnap, barangTetapSnap] = await Promise.all([
        getDocs(query(collection(db, "toko"), orderBy("nama"))),
        getDocs(query(collection(db, "laporan_bulanan"), orderBy("bulanKey", "desc"))),
        getDocs(query(collection(db, "pengeluaran"), orderBy("bulanKey", "desc"))),
        getDocs(query(collection(db, "laporan_barang_tetap"), orderBy("tokoNama"))),
      ])

      const tokoData: Toko[] = tokoSnap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: String(x?.nama || ""),
          aktif: Boolean(x?.aktif),
        }
      })

      const laporanData: LaporanBulanan[] = laporanSnap.docs.map((d) => {
        const x = d.data() as any

        const kategoriBreakdown: KategoriBreakdown[] = Array.isArray(x?.kategoriBreakdown)
          ? x.kategoriBreakdown.map((item: any) => ({
              kategoriId: String(item?.kategoriId || "").trim().toLowerCase(),
              kategoriNama: String(item?.nama || item?.kategoriNama || "Tanpa Kategori").trim(),
              jumlahTransaksi: Number(item?.jumlahTransaksi || 0),
              qtyTerjual: Number(item?.qtyTerjual || 0),
              omzet: Number(item?.omzet || 0),
              subtotal: Number(item?.subtotal || 0),
              totalDiskon: Number(item?.totalDiskon || 0),
              totalSetelahDiskon: Number(item?.totalSetelahDiskon || 0),
              totalModal: Number(item?.totalModal || 0),
              totalBiayaAdmin: Number(item?.totalBiayaAdmin || 0),
              labaKotor: Number(
                item?.labaKotor ??
                  Number(item?.totalSetelahDiskon || 0) - Number(item?.totalModal || 0)
              ),
              labaBersih: Number(
                item?.labaBersih ??
                  item?.labaKotor ??
                  Number(item?.totalSetelahDiskon || 0) -
                    Number(item?.totalModal || 0) -
                    Number(item?.totalBiayaAdmin || 0)
              ),
            }))
          : []

        return {
          id: d.id,
          bulanKey: String(x?.bulanKey || ""),
          tokoId: String(x?.tokoId || ""),
          tokoNama: String(x?.tokoNama || ""),
          totalLabaKotor: Number(x?.totalLabaKotor || 0),
          totalKeuntunganBersih: Number(
            x?.totalKeuntunganBersih ?? x?.totalLabaKotor ?? 0
          ),
          omzet: Number(x?.omzet || 0),
          jumlahTransaksi: Number(x?.jumlahTransaksi || 0),
          kategoriBreakdown,
        }
      })

      const pengeluaranData: Pengeluaran[] = pengeluaranSnap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          bulanKey: String(x?.bulanKey || ""),
          tokoId: String(x?.tokoId || ""),
          tokoNama: String(x?.tokoNama || ""),
          kategoriId: String(x?.kategoriId || ""),
          kategoriNama: String(x?.kategoriNama || ""),
          nominal: Number(x?.nominal || 0),
        }
      })

      const barangTetapData: LaporanBarangTetap[] = barangTetapSnap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          tokoId: String(x?.tokoId || d.id || ""),
          tokoNama: String(x?.tokoNama || ""),
          jumlahAset: Number(x?.jumlahAset || 0),
          totalNilai: Number(x?.totalNilai || 0),
          kategoriBreakdown: Array.isArray(x?.kategoriBreakdown)
            ? x.kategoriBreakdown.map((item: any) => ({
                kategoriId: String(item?.kategoriId || "").trim(),
                kategoriNama: String(item?.kategoriNama || "Tanpa Kategori").trim(),
                jumlahAset: Number(item?.jumlahAset || 0),
                totalNilai: Number(item?.totalNilai || 0),
              }))
            : [],
          updatedAtMs: x?.updatedAtMs ? Number(x.updatedAtMs) : undefined,
        }
      })

      setTokoList(tokoData.filter((item) => item.nama))
      setLaporanBulananList(laporanData.filter((item) => item.bulanKey))
      setPengeluaranList(pengeluaranData.filter((item) => item.bulanKey))
      setLaporanBarangTetapList(barangTetapData.filter((item) => item.tokoNama || item.tokoId))
    } catch (err) {
      console.error(err)
      setError("Gagal memuat laporan setelah modal tetap")
      setTokoList([])
      setLaporanBulananList([])
      setPengeluaranList([])
      setLaporanBarangTetapList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) {
        await fetchAll()
      }
    })
    return () => unsub()
  }, [])

  const kategoriAsetOptions = useMemo(() => {
    const map = new Map<string, KategoriAsetOption>()

    for (const item of laporanBarangTetapList) {
      for (const row of item.kategoriBreakdown || []) {
        const rawId = String(row.kategoriId || "").trim()
        const rawNama = String(row.kategoriNama || "Tanpa Kategori").trim() || "Tanpa Kategori"
        const key = rawId || rawNama.toLowerCase()

        if (!map.has(key)) {
          map.set(key, {
            id: key,
            nama: rawNama,
          })
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.nama.localeCompare(b.nama))
  }, [laporanBarangTetapList])

  const rekapOperasionalList = useMemo(() => {
    const map = new Map<string, RekapOperasional>()

    for (const item of laporanBulananList) {
      const key = `${item.bulanKey}__${item.tokoId || item.tokoNama || "tanpa-toko"}`
      const current = map.get(key) || {
        bulanKey: item.bulanKey,
        tokoId: item.tokoId,
        tokoNama: item.tokoNama || "Tanpa Toko",
        penghasilanKotor: 0,
        pengeluaran: 0,
        keuntunganBersih: 0,
        omzet: 0,
        jumlahTransaksi: 0,
        jumlahQtyTerjual: 0,
        jumlahDataPengeluaran: 0,
      }

      current.penghasilanKotor += Number(
        item.totalKeuntunganBersih || item.totalLabaKotor || 0
      )
      current.omzet += Number(item.omzet || 0)
      current.jumlahTransaksi += Number(item.jumlahTransaksi || 0)
      current.jumlahQtyTerjual += Number(
        (item.kategoriBreakdown || []).reduce(
          (sum, row) => sum + Number(row?.qtyTerjual || 0),
          0
        )
      )

      map.set(key, current)
    }

    for (const item of pengeluaranList) {
      const key = `${item.bulanKey}__${item.tokoId || item.tokoNama || "tanpa-toko"}`
      const current = map.get(key) || {
        bulanKey: item.bulanKey,
        tokoId: item.tokoId,
        tokoNama: item.tokoNama || "Tanpa Toko",
        penghasilanKotor: 0,
        pengeluaran: 0,
        keuntunganBersih: 0,
        omzet: 0,
        jumlahTransaksi: 0,
        jumlahQtyTerjual: 0,
        jumlahDataPengeluaran: 0,
      }

      current.pengeluaran += Number(item.nominal || 0)
      current.jumlahDataPengeluaran += 1

      map.set(key, current)
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        keuntunganBersih: item.penghasilanKotor - item.pengeluaran,
      }))
      .sort((a, b) => {
        const bulanCompare = b.bulanKey.localeCompare(a.bulanKey)
        if (bulanCompare !== 0) return bulanCompare
        return b.keuntunganBersih - a.keuntunganBersih
      })
  }, [laporanBulananList, pengeluaranList])

  const filteredOperasional = useMemo(() => {
    const q = search.toLowerCase().trim()

    return rekapOperasionalList.filter((item) => {
      const matchSearch =
        !q ||
        item.bulanKey.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q)

      const matchToko = !filterToko || item.tokoId === filterToko
      const matchStart = !bulanMulai || item.bulanKey >= bulanMulai
      const matchEnd = !bulanSelesai || item.bulanKey <= bulanSelesai

      return matchSearch && matchToko && matchStart && matchEnd
    })
  }, [rekapOperasionalList, search, filterToko, bulanMulai, bulanSelesai])

  const filteredBarangTetap = useMemo(() => {
    return laporanBarangTetapList.filter((item) => {
      if (filterToko && item.tokoId !== filterToko) return false

      const matchKategoriAset =
        !filterKategoriAset ||
        item.kategoriBreakdown.some((row) => {
          const key =
            String(row.kategoriId || "").trim() ||
            String(row.kategoriNama || "").trim().toLowerCase()

          return key === filterKategoriAset
        })

      if (!matchKategoriAset) return false

      const q = search.toLowerCase().trim()
      if (!q) return true

      return (
        item.tokoNama.toLowerCase().includes(q) ||
        item.kategoriBreakdown.some((row) =>
          row.kategoriNama.toLowerCase().includes(q)
        )
      )
    })
  }, [laporanBarangTetapList, filterToko, filterKategoriAset, search])

  const totalKeuntunganBersihOperasional = filteredOperasional.reduce(
    (acc, item) => acc + item.keuntunganBersih,
    0
  )

  const totalModalTetap = filteredBarangTetap.reduce(
    (acc, item) => acc + Number(item.totalNilai || 0),
    0
  )

  const sisaSetelahModal = totalKeuntunganBersihOperasional - totalModalTetap

  const totalOmzet = filteredOperasional.reduce((acc, item) => acc + item.omzet, 0)
  const totalTransaksi = filteredOperasional.reduce(
    (acc, item) => acc + item.jumlahTransaksi,
    0
  )
  const totalQtyTerjual = filteredOperasional.reduce(
    (acc, item) => acc + item.jumlahQtyTerjual,
    0
  )
  const totalJumlahAset = filteredBarangTetap.reduce(
    (acc, item) => acc + Number(item.jumlahAset || 0),
    0
  )

  const rekapPerToko = useMemo(() => {
    const map = new Map<string, RekapSetelahModal>()

    for (const item of filteredOperasional) {
      const key = item.tokoId || item.tokoNama || "tanpa-toko"
      const current = map.get(key) || {
        tokoId: item.tokoId,
        tokoNama: item.tokoNama || "Tanpa Toko",
        keuntunganBersih: 0,
        modalTetap: 0,
        sisaSetelahModal: 0,
        omzet: 0,
        jumlahTransaksi: 0,
        jumlahQtyTerjual: 0,
        jumlahDataPengeluaran: 0,
        jumlahAset: 0,
      }

      current.keuntunganBersih += item.keuntunganBersih
      current.omzet += item.omzet
      current.jumlahTransaksi += item.jumlahTransaksi
      current.jumlahQtyTerjual += item.jumlahQtyTerjual
      current.jumlahDataPengeluaran += item.jumlahDataPengeluaran

      map.set(key, current)
    }

    for (const item of filteredBarangTetap) {
      const key = item.tokoId || item.tokoNama || "tanpa-toko"
      const current = map.get(key) || {
        tokoId: item.tokoId,
        tokoNama: item.tokoNama || "Tanpa Toko",
        keuntunganBersih: 0,
        modalTetap: 0,
        sisaSetelahModal: 0,
        omzet: 0,
        jumlahTransaksi: 0,
        jumlahQtyTerjual: 0,
        jumlahDataPengeluaran: 0,
        jumlahAset: 0,
      }

      current.modalTetap += Number(item.totalNilai || 0)
      current.jumlahAset += Number(item.jumlahAset || 0)

      map.set(key, current)
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        sisaSetelahModal: item.keuntunganBersih - item.modalTetap,
      }))
      .sort((a, b) => b.sisaSetelahModal - a.sisaSetelahModal)
  }, [filteredOperasional, filteredBarangTetap])

  const chartData = useMemo(() => {
    const monthMap = new Map<string, number>()

    for (const item of filteredOperasional) {
      monthMap.set(
        item.bulanKey,
        Number(monthMap.get(item.bulanKey) || 0) + Number(item.keuntunganBersih || 0)
      )
    }

    const sortedMonths = Array.from(monthMap.entries())
      .map(([bulanKey, keuntunganBersih]) => ({ bulanKey, keuntunganBersih }))
      .sort((a, b) => a.bulanKey.localeCompare(b.bulanKey))

    let runningProfit = 0

    return sortedMonths.map((item) => {
      runningProfit += Number(item.keuntunganBersih || 0)

      return {
        bulanKey: item.bulanKey,
        keuntunganBersihBulan: Number(item.keuntunganBersih || 0),
        akumulasiKeuntunganBersih: runningProfit,
        modalTetap: totalModalTetap,
        sisaSetelahModal: runningProfit - totalModalTetap,
      }
    })
  }, [filteredOperasional, totalModalTetap])

  const maxChartValue = Math.max(
    ...chartData.map((item) => Math.abs(item.sisaSetelahModal)),
    0
  )

  const rankingAsetKategori = useMemo(() => {
    const map = new Map<
      string,
      { kategoriId: string; kategoriNama: string; jumlahAset: number; totalNilai: number }
    >()

    for (const item of filteredBarangTetap) {
      for (const row of item.kategoriBreakdown || []) {
        const key =
          String(row.kategoriId || "").trim() ||
          String(row.kategoriNama || "").trim().toLowerCase()

        if (filterKategoriAset && key !== filterKategoriAset) continue

        const current = map.get(key) || {
          kategoriId: String(row.kategoriId || key),
          kategoriNama: String(row.kategoriNama || "Tanpa Kategori"),
          jumlahAset: 0,
          totalNilai: 0,
        }

        current.jumlahAset += Number(row.jumlahAset || 0)
        current.totalNilai += Number(row.totalNilai || 0)

        map.set(key, current)
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalNilai - a.totalNilai)
  }, [filteredBarangTetap, filterKategoriAset])

  const updatedAtModalTetap = filteredBarangTetap
    .map((item) => Number(item.updatedAtMs || 0))
    .filter(Boolean)
    .sort((a, b) => b - a)[0]

  return (
    <div className="space-y-4 text-slate-900 sm:space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200/50 sm:h-14 sm:w-14">
              <Landmark size={22} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
            </div>

            <div className="min-w-0 self-center sm:self-auto">
              <h1 className="text-lg font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                Laporan Setelah Modal Tetap
              </h1>
              <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
                Keuntungan bersih operasional · dikurangi modal permanen
              </p>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchAll}
            disabled={loading}
            className="flex h-8 items-center justify-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50 sm:self-auto"
          >
            <motion.span
              animate={loading ? { rotate: 360 } : {}}
              transition={loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}
            >
              <RefreshCw size={14} strokeWidth={2.5} />
            </motion.span>
            <span>Refresh</span>
          </motion.button>
        </div>
      </motion.div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
          <AlertCircle size={14} className="text-red-500" strokeWidth={2.5} />
          <p className="text-[11px] font-bold text-red-600">{error}</p>
        </div>
      ) : null}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Cari
            </label>
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Bulan, toko, atau kategori aset..."
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          <FilterSelect
            label="Toko"
            value={filterToko}
            onChange={setFilterToko}
            icon={Store}
          >
            <option value="">Semua Toko</option>
            {tokoList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nama}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Kategori Aset"
            value={filterKategoriAset}
            onChange={setFilterKategoriAset}
            icon={Package}
          >
            <option value="">Semua Kategori Aset</option>
            {kategoriAsetOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nama}
              </option>
            ))}
          </FilterSelect>

          <div>
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Mulai
            </label>
            <div className="relative">
              <CalendarDays
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                type="month"
                value={bulanMulai}
                onChange={(e) => setBulanMulai(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Selesai
            </label>
            <div className="relative">
              <CalendarDays
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                type="month"
                value={bulanSelesai}
                onChange={(e) => setBulanSelesai(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard
          icon={CircleDollarSign}
          label="Keuntungan Bersih"
          value={formatRupiah(totalKeuntunganBersihOperasional)}
          subValue={`${totalTransaksi} transaksi • omzet ${formatRupiah(totalOmzet)}`}
        />
        <InfoCard
          icon={Building2}
          label="Modal Tetap"
          value={formatRupiah(totalModalTetap)}
          subValue={`${totalJumlahAset} aset tetap`}
        />
        <InfoCard
          icon={sisaSetelahModal < 0 ? TrendingDown : TrendingUp}
          label="Sisa Setelah Modal"
          value={formatRupiah(sisaSetelahModal)}
          subValue={
            updatedAtModalTetap
              ? `Snapshot aset ${new Date(updatedAtModalTetap).toLocaleDateString("id-ID")}`
              : "Snapshot aset saat ini"
          }
        />
        <InfoCard
          icon={ReceiptText}
          label="Qty Terjual"
          value={new Intl.NumberFormat("id-ID").format(totalQtyTerjual)}
          subValue={`${rekapPerToko.length} toko direkap`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Chart Akumulasi Setelah Modal
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Akumulasi keuntungan bersih per bulan lalu dikurangi modal tetap
              </p>
            </div>

            {chartData.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-4">
                {chartData.map((item) => {
                  const percent =
                    maxChartValue > 0
                      ? (Math.abs(item.sisaSetelahModal) / maxChartValue) * 100
                      : 0

                  const isNegative = item.sisaSetelahModal < 0

                  return (
                    <div key={item.bulanKey}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                          {formatBulanKey(item.bulanKey)}
                        </p>
                        <p
                          className={`text-sm font-black ${
                            isNegative ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          {formatRupiah(item.sisaSetelahModal)}
                        </p>
                      </div>

                      <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full ${
                            isNegative
                              ? "bg-gradient-to-r from-red-400 to-orange-500"
                              : "bg-gradient-to-r from-emerald-400 to-cyan-500"
                          }`}
                          style={{ width: `${Math.max(percent, 2)}%` }}
                        />
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                          Akumulasi: {formatRupiah(item.akumulasiKeuntunganBersih)}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200">
                          Modal: {formatRupiah(item.modalTetap)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Rekap Per Toko
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Detail keuntungan operasional dikurangi modal tetap
              </p>
            </div>

            {rekapPerToko.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-3">
                {rekapPerToko.map((item, index) => {
                  const isNegative = item.sisaSetelahModal < 0

                  return (
                    <div
                      key={`${item.tokoId}-${index}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-800">
                            {item.tokoNama || "Tanpa Toko"}
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {item.jumlahAset} aset tetap • {item.jumlahTransaksi} transaksi
                          </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                              Operasional
                            </p>
                            <p className="text-sm font-black text-slate-800">
                              {formatRupiah(item.keuntunganBersih)}
                            </p>
                          </div>

                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                              Modal
                            </p>
                            <p className="text-sm font-black text-violet-700">
                              {formatRupiah(item.modalTetap)}
                            </p>
                          </div>

                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                              Sisa
                            </p>
                            <p
                              className={`text-sm font-black ${
                                isNegative ? "text-red-600" : "text-emerald-600"
                              }`}
                            >
                              {formatRupiah(item.sisaSetelahModal)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Omzet
                          </p>
                          <p className="mt-1 text-sm font-black text-slate-800">
                            {formatRupiah(item.omzet)}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Qty Terjual
                          </p>
                          <p className="mt-1 text-sm font-black text-slate-800">
                            {item.jumlahQtyTerjual}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Pengeluaran
                          </p>
                          <p className="mt-1 text-sm font-black text-slate-800">
                            {item.jumlahDataPengeluaran}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Jumlah Aset
                          </p>
                          <p className="mt-1 text-sm font-black text-slate-800">
                            {item.jumlahAset}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 xl:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Ranking Toko
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Toko dengan sisa setelah modal terbesar
              </p>
            </div>

            {rekapPerToko.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-3">
                {rekapPerToko.slice(0, 8).map((item, idx) => {
                  const isNegative = item.sisaSetelahModal < 0

                  return (
                    <div
                      key={`${item.tokoId}-${idx}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500 text-[10px] font-black text-white">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-800">
                                {item.tokoNama}
                              </p>
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                {item.jumlahAset} aset • omzet {formatRupiah(item.omzet)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <p
                            className={`text-sm font-black ${
                              isNegative ? "text-red-600" : "text-emerald-600"
                            }`}
                          >
                            {formatRupiah(item.sisaSetelahModal)}
                          </p>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Modal {formatRupiah(item.modalTetap)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Ranking Aset
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Kategori aset tetap dengan nilai tertinggi
              </p>
            </div>

            {rankingAsetKategori.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-3">
                {rankingAsetKategori.slice(0, 8).map((item, idx) => (
                  <div
                    key={`${item.kategoriId}-${idx}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black text-white">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-800">
                              {item.kategoriNama}
                            </p>
                            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              {item.jumlahAset} aset
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-black text-violet-700">
                          {formatRupiah(item.totalNilai)}
                        </p>
                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Nilai aset
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Ringkasan
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Gambaran cepat setelah modal tetap
              </p>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-800">Keuntungan Operasional</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      Hasil bersih sebelum dikurangi aset tetap
                    </p>
                  </div>
                  <p className="text-sm font-black text-slate-800">
                    {formatRupiah(totalKeuntunganBersihOperasional)}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-800">Total Modal Tetap</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      Diambil dari snapshot laporan barang tetap
                    </p>
                  </div>
                  <p className="text-sm font-black text-violet-700">
                    {formatRupiah(totalModalTetap)}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-800">Sisa Setelah Modal</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      Keuntungan operasional dikurangi modal tetap
                    </p>
                  </div>
                  <p
                    className={`text-sm font-black ${
                      sisaSetelahModal < 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {formatRupiah(sisaSetelahModal)}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-800">Bulan Direkap</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      Total titik data chart
                    </p>
                  </div>
                  <p className="text-sm font-black text-slate-800">{chartData.length}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-800">Toko Direkap</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      Toko dengan profit atau aset tetap
                    </p>
                  </div>
                  <p className="text-sm font-black text-slate-800">{rekapPerToko.length}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-800">Kondisi Akhir</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      Status setelah dikurangi modal tetap
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sisaSetelahModal < 0 ? (
                      <TrendingDown size={16} className="text-red-500" />
                    ) : (
                      <TrendingUp size={16} className="text-emerald-500" />
                    )}
                    <p
                      className={`text-sm font-black ${
                        sisaSetelahModal < 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {sisaSetelahModal < 0 ? "Belum Tertutup" : "Sudah Tertutup"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-[11px] font-bold text-amber-700">
          Modal tetap pada halaman ini memakai <span className="font-black">snapshot saat ini</span> dari
          koleksi <span className="font-black">laporan_barang_tetap</span>, lalu dibandingkan dengan
          keuntungan bersih operasional dari periode bulan yang dipilih.
        </p>
      </div>
    </div>
  )
}