/*
  Halaman admin laporan sisa keuntungan setelah modal tetap.
  Membaca laporan_bulanan, pengeluaran, dan laporan_barang_tetap untuk menghitung
  keuntungan operasional, modal tetap, serta sisa keuntungan setelah modal tetap.
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, getDocs, orderBy, query } from "firebase/firestore"
import {
  AlertCircle,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Cpu,
  Landmark,
  ListFilter,
  Package,
  ReceiptText,
  RefreshCw,
  Search,
  Store,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

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

type ChartItem = {
  bulanKey: string
  keuntunganBersihBulan: number
  akumulasiKeuntunganBersih: number
  modalTetap: number
  sisaSetelahModal: number
}

type RankingModalType = "toko" | "aset" | "ringkasan" | null
type MobileReportTab = "chart" | "rekap"

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

function shortNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(Number(value || 0))
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
          } py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20`}
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
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [rankingModal, setRankingModal] = useState<RankingModalType>(null)
  const [mobileReportTab, setMobileReportTab] = useState<MobileReportTab>("chart")

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
      if (user) await fetchAll()
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
          map.set(key, { id: key, nama: rawNama })
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

      current.penghasilanKotor += Number(item.totalKeuntunganBersih || item.totalLabaKotor || 0)
      current.omzet += Number(item.omzet || 0)
      current.jumlahTransaksi += Number(item.jumlahTransaksi || 0)
      current.jumlahQtyTerjual += Number(
        (item.kategoriBreakdown || []).reduce((sum, row) => sum + Number(row?.qtyTerjual || 0), 0)
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
      .map((item) => ({ ...item, keuntunganBersih: item.penghasilanKotor - item.pengeluaran }))
      .sort((a, b) => {
        const bulanCompare = b.bulanKey.localeCompare(a.bulanKey)
        if (bulanCompare !== 0) return bulanCompare
        return b.keuntunganBersih - a.keuntunganBersih
      })
  }, [laporanBulananList, pengeluaranList])

  const filteredOperasional = useMemo(() => {
    const q = search.toLowerCase().trim()

    return rekapOperasionalList.filter((item) => {
      const matchSearch = !q || item.bulanKey.toLowerCase().includes(q) || item.tokoNama.toLowerCase().includes(q)
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
          const key = String(row.kategoriId || "").trim() || String(row.kategoriNama || "").trim().toLowerCase()
          return key === filterKategoriAset
        })

      if (!matchKategoriAset) return false

      const q = search.toLowerCase().trim()
      if (!q) return true

      return (
        item.tokoNama.toLowerCase().includes(q) ||
        item.kategoriBreakdown.some((row) => row.kategoriNama.toLowerCase().includes(q))
      )
    })
  }, [laporanBarangTetapList, filterToko, filterKategoriAset, search])

  const totalKeuntunganBersihOperasional = filteredOperasional.reduce((acc, item) => acc + item.keuntunganBersih, 0)
  const totalModalTetap = filteredBarangTetap.reduce((acc, item) => acc + Number(item.totalNilai || 0), 0)
  const sisaSetelahModal = totalKeuntunganBersihOperasional - totalModalTetap
  const totalOmzet = filteredOperasional.reduce((acc, item) => acc + item.omzet, 0)
  const totalTransaksi = filteredOperasional.reduce((acc, item) => acc + item.jumlahTransaksi, 0)
  const totalQtyTerjual = filteredOperasional.reduce((acc, item) => acc + item.jumlahQtyTerjual, 0)
  const totalJumlahAset = filteredBarangTetap.reduce((acc, item) => acc + Number(item.jumlahAset || 0), 0)

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
      .map((item) => ({ ...item, sisaSetelahModal: item.keuntunganBersih - item.modalTetap }))
      .sort((a, b) => b.sisaSetelahModal - a.sisaSetelahModal)
  }, [filteredOperasional, filteredBarangTetap])

  const chartData = useMemo(() => {
    const monthMap = new Map<string, number>()

    for (const item of filteredOperasional) {
      monthMap.set(item.bulanKey, Number(monthMap.get(item.bulanKey) || 0) + Number(item.keuntunganBersih || 0))
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

  const displayChartData = useMemo(() => [...chartData].sort((a, b) => b.bulanKey.localeCompare(a.bulanKey)), [chartData])
  const maxChartValue = Math.max(...chartData.map((item) => Math.abs(item.sisaSetelahModal)), 0)

  const rankingAsetKategori = useMemo(() => {
    const map = new Map<string, { kategoriId: string; kategoriNama: string; jumlahAset: number; totalNilai: number }>()

    for (const item of filteredBarangTetap) {
      for (const row of item.kategoriBreakdown || []) {
        const key = String(row.kategoriId || "").trim() || String(row.kategoriNama || "").trim().toLowerCase()
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

  const resetFilter = () => {
    setSearch("")
    setFilterToko("")
    setFilterKategoriAset("")
    setBulanMulai(getStartOfYearMonthInput())
    setBulanSelesai(toMonthInputValue(new Date()))
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
                <Landmark size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Laporan Setelah Modal Tetap
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Rekap keuntungan operasional setelah dikurangi snapshot modal aset tetap.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={fetchAll}
                disabled={loading}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15 disabled:opacity-60"
                type="button"
              >
                <RefreshCw size={12} strokeWidth={2.8} className={loading ? "animate-spin" : ""} />
                <span>Refresh</span>
              </motion.button>
            </div>
          </div>

          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.04]">
            <Cpu size={150} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg"
            >
              <AlertCircle size={16} className="text-red-600" strokeWidth={2.5} />
              <p className="max-w-xs text-xs font-black text-red-700">{error}</p>
              <button type="button" onClick={() => setError(null)} className="text-red-500">
                <X size={14} strokeWidth={3} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          <StatCard icon={CircleDollarSign} label="Keuntungan Bersih" value={formatRupiah(totalKeuntunganBersihOperasional)} subValue={`${totalTransaksi} transaksi`} />
          <StatCard icon={Building2} label="Modal Tetap" value={formatRupiah(totalModalTetap)} subValue={`${totalJumlahAset} aset`} />
          <StatCard icon={sisaSetelahModal < 0 ? TrendingDown : TrendingUp} label="Sisa Setelah Modal" value={formatRupiah(sisaSetelahModal)} subValue={`Omzet ${formatRupiah(totalOmzet)}`} />
          <StatCard icon={ReceiptText} label="Qty Terjual" value={shortNumber(totalQtyTerjual)} subValue={`${rekapPerToko.length} toko`} />
        </div>

        <div className="grid grid-cols-3 gap-2 sm:hidden">
          <MobileActionButton icon={Store} label="Toko" onClick={() => setRankingModal("toko")} />
          <MobileActionButton icon={Package} label="Aset" onClick={() => setRankingModal("aset")} />
          <MobileActionButton icon={Wallet} label="Ringkasan" onClick={() => setRankingModal("ringkasan")} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:hidden"
        >
          <div className="grid grid-cols-2 gap-2">
            <MobileReportTabButton active={mobileReportTab === "chart"} icon={BarChart3} label="Chart" onClick={() => setMobileReportTab("chart")} />
            <MobileReportTabButton active={mobileReportTab === "rekap"} icon={Landmark} label="Rekap Toko" onClick={() => setMobileReportTab("rekap")} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.06 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-black text-slate-800 sm:text-base">Filter Laporan</h2>
            </div>

            <button
              type="button"
              onClick={() => setFilterMobileOpen((prev) => !prev)}
              className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-[10px] font-black uppercase tracking-[0.08em] sm:hidden ${
                filterMobileOpen
                  ? "border-sky-200 bg-sky-100 text-sky-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <ListFilter size={14} strokeWidth={2.5} />
              Filter
            </button>
          </div>

          <div className="hidden grid-cols-1 gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-6">
            <FilterFields
              search={search}
              setSearch={setSearch}
              filterToko={filterToko}
              setFilterToko={setFilterToko}
              tokoList={tokoList}
              filterKategoriAset={filterKategoriAset}
              setFilterKategoriAset={setFilterKategoriAset}
              kategoriAsetOptions={kategoriAsetOptions}
              bulanMulai={bulanMulai}
              setBulanMulai={setBulanMulai}
              bulanSelesai={bulanSelesai}
              setBulanSelesai={setBulanSelesai}
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
                <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <FilterFields
                    search={search}
                    setSearch={setSearch}
                    filterToko={filterToko}
                    setFilterToko={setFilterToko}
                    tokoList={tokoList}
                    filterKategoriAset={filterKategoriAset}
                    setFilterKategoriAset={setFilterKategoriAset}
                    kategoriAsetOptions={kategoriAsetOptions}
                    bulanMulai={bulanMulai}
                    setBulanMulai={setBulanMulai}
                    bulanSelesai={bulanSelesai}
                    setBulanSelesai={setBulanSelesai}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={resetFilter}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition-all hover:bg-slate-50"
            >
              Reset Filter
            </button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={fetchAll}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-white shadow-sm shadow-sky-500/15 disabled:cursor-not-allowed disabled:opacity-60 sm:hidden"
              type="button"
            >
              <RefreshCw size={13} strokeWidth={2.7} className={loading ? "animate-spin" : ""} />
              Refresh
            </motion.button>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-7">
            <div className={mobileReportTab === "chart" ? "block" : "hidden sm:block"}>
              <ReportChart chartData={displayChartData} maxChartValue={maxChartValue} />
            </div>

            <div className={`${mobileReportTab === "rekap" ? "block" : "hidden sm:block"} rounded-2xl border border-slate-200 bg-white p-4 shadow-sm`}>
              <div className="mb-4">
                <h2 className="text-sm font-black text-slate-800 sm:text-base">Rekap Per Toko</h2>
              </div>

              {loading ? (
                <LoadingState label="Memuat laporan..." />
              ) : rekapPerToko.length === 0 ? (
                <EmptyState label="Belum ada data" />
              ) : (
                <div className="space-y-3">
                  {rekapPerToko.map((item, index) => (
                    <RekapModalCard key={`${item.tokoId}-${index}`} item={item} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="hidden space-y-4 xl:col-span-5 xl:block">
            <RankingPanel title="Ranking Toko" description="Toko dengan sisa setelah modal terbesar" type="toko" rows={rekapPerToko} />
            <RankingPanel title="Ranking Aset" description="Kategori aset tetap dengan nilai tertinggi" type="aset" rows={rankingAsetKategori} />
            <SummaryPanel
              totalKeuntunganBersihOperasional={totalKeuntunganBersihOperasional}
              totalModalTetap={totalModalTetap}
              sisaSetelahModal={sisaSetelahModal}
              chartDataLength={chartData.length}
              rekapPerTokoLength={rekapPerToko.length}
              updatedAtModalTetap={updatedAtModalTetap}
            />
          </div>
        </div>

        <RankingModal
          type={rankingModal}
          onClose={() => setRankingModal(null)}
          rekapPerToko={rekapPerToko}
          rankingAsetKategori={rankingAsetKategori}
          totalKeuntunganBersihOperasional={totalKeuntunganBersihOperasional}
          totalModalTetap={totalModalTetap}
          sisaSetelahModal={sisaSetelahModal}
          chartDataLength={chartData.length}
          rekapPerTokoLength={rekapPerToko.length}
          updatedAtModalTetap={updatedAtModalTetap}
        />
      </main>
    </div>
  )
}

function StatCard({
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
    <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4">
      <div className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left">
        <div className="hidden h-9 w-9 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 sm:flex sm:h-11 sm:w-11">
          <Icon size={18} strokeWidth={2.5} className="sm:h-[21px] sm:w-[21px]" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[10px] sm:tracking-widest">
            {label}
          </p>
          <p className="truncate text-sm font-black leading-tight text-slate-800 sm:text-xl">{value}</p>
          {subValue ? <p className="mt-0.5 hidden truncate text-[10px] font-bold text-slate-400 sm:block">{subValue}</p> : null}
        </div>
      </div>
    </div>
  )
}

function MobileActionButton({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      onClick={onClick}
      type="button"
      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700"
    >
      <Icon size={14} strokeWidth={2.5} />
      {label}
    </motion.button>
  )
}

function MobileReportTabButton({
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
      className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-[0.06em] transition ${
        active
          ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-lg shadow-sky-500/15"
          : "border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon size={15} strokeWidth={2.5} />
      <span className="truncate">{label}</span>
    </button>
  )
}

function FilterFields({
  search,
  setSearch,
  filterToko,
  setFilterToko,
  tokoList,
  filterKategoriAset,
  setFilterKategoriAset,
  kategoriAsetOptions,
  bulanMulai,
  setBulanMulai,
  bulanSelesai,
  setBulanSelesai,
}: {
  search: string
  setSearch: (value: string) => void
  filterToko: string
  setFilterToko: (value: string) => void
  tokoList: Toko[]
  filterKategoriAset: string
  setFilterKategoriAset: (value: string) => void
  kategoriAsetOptions: KategoriAsetOption[]
  bulanMulai: string
  setBulanMulai: (value: string) => void
  bulanSelesai: string
  setBulanSelesai: (value: string) => void
}) {
  return (
    <>
      <div className="sm:col-span-2 lg:col-span-2">
        <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">Cari</label>
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Bulan, toko, atau kategori aset..."
            className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
          />
        </div>
      </div>

      <FilterSelect label="Toko" value={filterToko} onChange={setFilterToko} icon={Store}>
        <option value="">Semua Toko</option>
        {tokoList.map((item) => (
          <option key={item.id} value={item.id}>{item.nama}</option>
        ))}
      </FilterSelect>

      <FilterSelect label="Kategori Aset" value={filterKategoriAset} onChange={setFilterKategoriAset} icon={Package}>
        <option value="">Semua Kategori Aset</option>
        {kategoriAsetOptions.map((item) => (
          <option key={item.id} value={item.id}>{item.nama}</option>
        ))}
      </FilterSelect>

      <MonthInput label="Mulai" value={bulanMulai} onChange={setBulanMulai} />
      <MonthInput label="Selesai" value={bulanSelesai} onChange={setBulanSelesai} />
    </>
  )
}

function MonthInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</label>
      <div className="relative">
        <CalendarDays size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2} />
        <input
          type="month"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        />
      </div>
    </div>
  )
}

function ReportChart({ chartData, maxChartValue }: { chartData: ChartItem[]; maxChartValue: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-sm font-black text-slate-800 sm:text-base">Chart Akumulasi Setelah Modal</h2>
      </div>

      {chartData.length === 0 ? (
        <EmptyState label="Belum ada data" />
      ) : (
        <div className="space-y-4">
          {chartData.map((item) => {
            const percent = maxChartValue > 0 ? (Math.abs(item.sisaSetelahModal) / maxChartValue) * 100 : 0
            const isNegative = item.sisaSetelahModal < 0

            return (
              <div key={item.bulanKey}>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{formatBulanKey(item.bulanKey)}</p>
                  <p className={`text-sm font-black ${isNegative ? "text-red-600" : "text-sky-700"}`}>
                    {formatRupiah(item.sisaSetelahModal)}
                  </p>
                </div>

                <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${isNegative ? "bg-gradient-to-r from-red-400 to-orange-500" : "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500"}`}
                    style={{ width: `${Math.max(percent, 2)}%` }}
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200">
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
  )
}

function RekapModalCard({ item }: { item: RekapSetelahModal }) {
  const isNegative = item.sisaSetelahModal < 0

  return (
    <div className="overflow-hidden bg-transparent p-0 shadow-none ring-0 sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-white sm:p-4 sm:shadow-sm sm:ring-1 sm:ring-slate-100/70">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-700 sm:bg-slate-50">
          {item.tokoNama || "Tanpa Toko"}
        </span>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-black text-sky-700 ring-1 ring-sky-100">
          {item.jumlahAset} aset
        </span>
      </div>

      <h3 className="mt-3 text-base font-black leading-tight text-slate-800">Sisa Setelah Modal</h3>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        Omzet {formatRupiah(item.omzet)} • {shortNumber(item.jumlahTransaksi)} transaksi • Qty {shortNumber(item.jumlahQtyTerjual)}
      </p>

      <div className="mt-4 space-y-2 rounded-none border-0 bg-transparent p-0 sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-slate-50/70 sm:p-2">
        <MetricRow label="Operasional" value={formatRupiah(item.keuntunganBersih)} tone="slate" />
        <MetricRow label="Modal Tetap" value={formatRupiah(item.modalTetap)} tone="violet" />
        <MetricRow label="Sisa" value={formatRupiah(item.sisaSetelahModal)} tone={isNegative ? "red" : "sky"} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniMetric label="Omzet" value={formatRupiah(item.omzet)} className="col-span-2" />
        <MiniMetric label="Qty Terjual" value={shortNumber(item.jumlahQtyTerjual)} />
        <MiniMetric label="Data Keluar" value={shortNumber(item.jumlahDataPengeluaran)} />
      </div>
    </div>
  )
}

function MetricRow({ label, value, tone }: { label: string; value: string; tone: "slate" | "red" | "sky" | "violet" }) {
  const color = tone === "red" ? "text-red-600" : tone === "sky" ? "text-sky-700" : tone === "violet" ? "text-violet-700" : "text-slate-800"

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`text-sm font-black ${color}`}>{value}</p>
    </div>
  )
}

function MiniMetric({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 ${className}`}>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-800">{value}</p>
    </div>
  )
}

function RankingPanel({ title, description, type, rows }: { title: string; description: string; type: "toko" | "aset"; rows: any[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-sm font-black text-slate-800">{title}</h2>
        <p className="mt-1 text-xs font-semibold text-slate-500">{description}</p>
      </div>
      <RankingList type={type} rows={rows} />
    </div>
  )
}

function RankingList({ type, rows }: { type: "toko" | "aset"; rows: any[] }) {
  if (rows.length === 0) return <EmptyState label="Belum ada data" />

  return (
    <div className="space-y-3">
      {rows.slice(0, 8).map((item, idx) => {
        const isToko = type === "toko"
        const value = isToko ? Number(item.sisaSetelahModal || 0) : Number(item.totalNilai || 0)
        const isNegative = value < 0
        const title = isToko ? item.tokoNama : item.kategoriNama
        const sub = isToko
          ? `${shortNumber(item.jumlahAset)} aset • modal ${formatRupiah(item.modalTetap || 0)}`
          : `${shortNumber(item.jumlahAset)} aset`

        return (
          <div key={`${type}-${title}-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500 text-[10px] font-black text-white">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-800">{title || "-"}</p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{sub}</p>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <p className={`text-sm font-black ${isNegative ? "text-red-600" : isToko ? "text-sky-700" : "text-violet-700"}`}>
                  {formatRupiah(value)}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {isToko ? "Sisa" : "Nilai"}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SummaryPanel({
  totalKeuntunganBersihOperasional,
  totalModalTetap,
  sisaSetelahModal,
  chartDataLength,
  rekapPerTokoLength,
  updatedAtModalTetap,
}: {
  totalKeuntunganBersihOperasional: number
  totalModalTetap: number
  sisaSetelahModal: number
  chartDataLength: number
  rekapPerTokoLength: number
  updatedAtModalTetap?: number
}) {
  const rows = [
    { label: "Keuntungan Operasional", value: formatRupiah(totalKeuntunganBersihOperasional), tone: "slate" as const },
    { label: "Total Modal Tetap", value: formatRupiah(totalModalTetap), tone: "violet" as const },
    { label: "Sisa Setelah Modal", value: formatRupiah(sisaSetelahModal), tone: sisaSetelahModal < 0 ? "red" as const : "sky" as const },
    { label: "Bulan Direkap", value: shortNumber(chartDataLength), tone: "slate" as const },
    { label: "Toko Direkap", value: shortNumber(rekapPerTokoLength), tone: "slate" as const },
    {
      label: "Snapshot Aset",
      value: updatedAtModalTetap ? new Date(updatedAtModalTetap).toLocaleDateString("id-ID") : "Saat ini",
      tone: "slate" as const,
    },
  ]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-sm font-black text-slate-800">Ringkasan</h2>
        <p className="mt-1 text-xs font-semibold text-slate-500">Gambaran cepat setelah modal tetap</p>
      </div>
      <div className="space-y-3">
        {rows.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black text-slate-800">{item.label}</p>
              <p className={`text-sm font-black ${item.tone === "red" ? "text-red-600" : item.tone === "sky" ? "text-sky-700" : item.tone === "violet" ? "text-violet-700" : "text-slate-800"}`}>{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RankingModal({
  type,
  onClose,
  rekapPerToko,
  rankingAsetKategori,
  totalKeuntunganBersihOperasional,
  totalModalTetap,
  sisaSetelahModal,
  chartDataLength,
  rekapPerTokoLength,
  updatedAtModalTetap,
}: {
  type: RankingModalType
  onClose: () => void
  rekapPerToko: RekapSetelahModal[]
  rankingAsetKategori: Array<{ kategoriId: string; kategoriNama: string; jumlahAset: number; totalNilai: number }>
  totalKeuntunganBersihOperasional: number
  totalModalTetap: number
  sisaSetelahModal: number
  chartDataLength: number
  rekapPerTokoLength: number
  updatedAtModalTetap?: number
}) {
  const title = type === "toko" ? "Ranking Toko" : type === "aset" ? "Ranking Aset" : "Ringkasan"

  return (
    <AnimatePresence>
      {type ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px] xl:hidden"
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="max-h-[82vh] w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4">
              <div>
                <h2 className="text-base font-black text-slate-800">{title}</h2>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">Data sesuai filter aktif</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              >
                <X size={16} strokeWidth={2.7} />
              </button>
            </div>

            <div className="max-h-[68vh] overflow-y-auto p-4">
              {type === "toko" ? <RankingList type="toko" rows={rekapPerToko} /> : null}
              {type === "aset" ? <RankingList type="aset" rows={rankingAsetKategori} /> : null}
              {type === "ringkasan" ? (
                <SummaryPanel
                  totalKeuntunganBersihOperasional={totalKeuntunganBersihOperasional}
                  totalModalTetap={totalModalTetap}
                  sisaSetelahModal={sisaSetelahModal}
                  chartDataLength={chartDataLength}
                  rekapPerTokoLength={rekapPerTokoLength}
                  updatedAtModalTetap={updatedAtModalTetap}
                />
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-14">
      <div className="flex flex-col items-center gap-3">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
        />
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      </div>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
      {label}
    </div>
  )
}
