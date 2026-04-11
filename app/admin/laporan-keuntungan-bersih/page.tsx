/* 
  Halaman admin laporan keuntungan bersih.
  File ini membaca koleksi laporan_bulanan dan pengeluaran dari Firestore untuk menampilkan
  penghasilan kotor, total pengeluaran, keuntungan bersih per bulan, detail rekap bulanan,
  ranking bulan terbaik, dan chart batang keuntungan bersih per bulan.
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, getDocs, orderBy, query } from "firebase/firestore"
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ReceiptText,
  RefreshCw,
  Search,
  Store,
  TrendingUp,
  TrendingDown,
  Wallet,
} from "lucide-react"
import { motion } from "framer-motion"

type Toko = {
  id: string
  nama: string
  aktif?: boolean
}

type LaporanBulanan = {
  id: string
  bulanKey: string
  tokoId: string
  tokoNama: string
  totalLabaKotor: number
  omzet: number
  jumlahTransaksi: number
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

type RekapKeuntunganBersih = {
  bulanKey: string
  tokoId: string
  tokoNama: string
  penghasilanKotor: number
  pengeluaran: number
  keuntunganBersih: number
  omzet: number
  jumlahTransaksi: number
  jumlahDataPengeluaran: number
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

export default function LaporanKeuntunganBersihPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [laporanBulananList, setLaporanBulananList] = useState<LaporanBulanan[]>([])
  const [pengeluaranList, setPengeluaranList] = useState<Pengeluaran[]>([])

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [bulanMulai, setBulanMulai] = useState(getStartOfYearMonthInput())
  const [bulanSelesai, setBulanSelesai] = useState(toMonthInputValue(new Date()))

  const fetchAll = async () => {
    setLoading(true)
    setError(null)

    try {
      const [tokoSnap, laporanSnap, pengeluaranSnap] = await Promise.all([
        getDocs(query(collection(db, "toko"), orderBy("nama"))),
        getDocs(query(collection(db, "laporan_bulanan"), orderBy("bulanKey", "desc"))),
        getDocs(query(collection(db, "pengeluaran"), orderBy("bulanKey", "desc"))),
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
        return {
          id: d.id,
          bulanKey: String(x?.bulanKey || ""),
          tokoId: String(x?.tokoId || ""),
          tokoNama: String(x?.tokoNama || ""),
          totalLabaKotor: Number(x?.totalLabaKotor || 0),
          omzet: Number(x?.omzet || 0),
          jumlahTransaksi: Number(x?.jumlahTransaksi || 0),
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

      setTokoList(tokoData.filter((item) => item.nama))
      setLaporanBulananList(laporanData.filter((item) => item.bulanKey))
      setPengeluaranList(pengeluaranData.filter((item) => item.bulanKey))
    } catch (err) {
      console.error(err)
      setError("Gagal memuat laporan keuntungan bersih")
      setTokoList([])
      setLaporanBulananList([])
      setPengeluaranList([])
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

  const rekapList = useMemo(() => {
    const map = new Map<string, RekapKeuntunganBersih>()

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
        jumlahDataPengeluaran: 0,
      }

      current.penghasilanKotor += Number(item.totalLabaKotor || 0)
      current.omzet += Number(item.omzet || 0)
      current.jumlahTransaksi += Number(item.jumlahTransaksi || 0)

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

  const filteredRekap = useMemo(() => {
    const q = search.toLowerCase().trim()

    return rekapList.filter((item) => {
      const matchSearch =
        !q ||
        item.bulanKey.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q)

      const matchToko = !filterToko || item.tokoId === filterToko
      const matchStart = !bulanMulai || item.bulanKey >= bulanMulai
      const matchEnd = !bulanSelesai || item.bulanKey <= bulanSelesai

      return matchSearch && matchToko && matchStart && matchEnd
    })
  }, [rekapList, search, filterToko, bulanMulai, bulanSelesai])

  const totalPenghasilanKotor = filteredRekap.reduce(
    (acc, item) => acc + item.penghasilanKotor,
    0
  )
  const totalPengeluaran = filteredRekap.reduce((acc, item) => acc + item.pengeluaran, 0)
  const totalKeuntunganBersih = filteredRekap.reduce(
    (acc, item) => acc + item.keuntunganBersih,
    0
  )
  const totalOmzet = filteredRekap.reduce((acc, item) => acc + item.omzet, 0)
  const totalTransaksi = filteredRekap.reduce(
    (acc, item) => acc + item.jumlahTransaksi,
    0
  )

  const keuntunganBulanIni = filteredRekap
    .filter((item) => item.bulanKey === toMonthInputValue(new Date()))
    .reduce((acc, item) => acc + item.keuntunganBersih, 0)

  const rankingToko = useMemo(() => {
    const map = new Map<
      string,
      {
        tokoId: string
        tokoNama: string
        penghasilanKotor: number
        pengeluaran: number
        keuntunganBersih: number
        bulanAktif: number
      }
    >()

    for (const item of filteredRekap) {
      const key = item.tokoId || item.tokoNama || item.bulanKey
      const current = map.get(key) || {
        tokoId: item.tokoId,
        tokoNama: item.tokoNama || "Tanpa Toko",
        penghasilanKotor: 0,
        pengeluaran: 0,
        keuntunganBersih: 0,
        bulanAktif: 0,
      }

      current.penghasilanKotor += item.penghasilanKotor
      current.pengeluaran += item.pengeluaran
      current.keuntunganBersih += item.keuntunganBersih
      current.bulanAktif += 1

      map.set(key, current)
    }

    return Array.from(map.values()).sort((a, b) => b.keuntunganBersih - a.keuntunganBersih)
  }, [filteredRekap])

  const chartData = useMemo(() => {
    const map = new Map<
      string,
      {
        bulanKey: string
        penghasilanKotor: number
        pengeluaran: number
        keuntunganBersih: number
      }
    >()

    for (const item of filteredRekap) {
      const current = map.get(item.bulanKey) || {
        bulanKey: item.bulanKey,
        penghasilanKotor: 0,
        pengeluaran: 0,
        keuntunganBersih: 0,
      }

      current.penghasilanKotor += item.penghasilanKotor
      current.pengeluaran += item.pengeluaran
      current.keuntunganBersih += item.keuntunganBersih

      map.set(item.bulanKey, current)
    }

    return Array.from(map.values()).sort((a, b) => a.bulanKey.localeCompare(b.bulanKey))
  }, [filteredRekap])

  const maxChartValue = Math.max(
    ...chartData.map((item) => Math.abs(item.keuntunganBersih)),
    0
  )

  return (
    <div className="space-y-4 text-slate-900 sm:space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200/50 sm:h-14 sm:w-14">
              <BarChart3 size={24} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xl font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                Laporan Keuntungan Bersih
              </h1>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Laba kotor dikurangi pengeluaran · chart bulanan
              </p>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchAll}
            disabled={loading}
            className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50"
          >
            <motion.span
              animate={loading ? { rotate: 360 } : {}}
              transition={loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}
            >
              <RefreshCw size={14} strokeWidth={2.5} />
            </motion.span>
            Refresh
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                placeholder="Bulan atau toko..."
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
          label="Penghasilan Kotor"
          value={formatRupiah(totalPenghasilanKotor)}
          subValue={`${totalTransaksi} transaksi`}
        />
        <InfoCard
          icon={Wallet}
          label="Pengeluaran"
          value={formatRupiah(totalPengeluaran)}
          subValue={`${filteredRekap.length} rekap`}
        />
        <InfoCard
          icon={TrendingUp}
          label="Keuntungan Bersih"
          value={formatRupiah(totalKeuntunganBersih)}
          subValue={`Omzet ${formatRupiah(totalOmzet)}`}
        />
        <InfoCard
          icon={ReceiptText}
          label="Bulan Ini"
          value={formatRupiah(keuntunganBulanIni)}
          subValue="Keuntungan bersih bulan ini"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Chart Keuntungan Bersih Bulanan
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Grafik batang keuntungan bersih per bulan
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
                      ? (Math.abs(item.keuntunganBersih) / maxChartValue) * 100
                      : 0

                  const isNegative = item.keuntunganBersih < 0

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
                          {formatRupiah(item.keuntunganBersih)}
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
    Kotor: {formatRupiah(item.penghasilanKotor)}
  </span>
  <span className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
    Pengeluaran: {formatRupiah(item.pengeluaran)}
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
                Rekap Keuntungan Bersih
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Detail per bulan dan toko
              </p>
            </div>

            {filteredRekap.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRekap.map((item, index) => {
                  const isNegative = item.keuntunganBersih < 0

                  return (
                    <div
                      key={`${item.bulanKey}-${item.tokoId}-${index}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-800">
                            {formatBulanKey(item.bulanKey)}
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {item.tokoNama || "Tanpa Toko"} • {item.jumlahTransaksi} transaksi
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                              Kotor
                            </p>
                            <p className="text-sm font-black text-slate-800">
                              {formatRupiah(item.penghasilanKotor)}
                            </p>
                          </div>

                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                              Pengeluaran
                            </p>
                            <p className="text-sm font-black text-red-600">
                              {formatRupiah(item.pengeluaran)}
                            </p>
                          </div>

                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                              Bersih
                            </p>
                            <p
                              className={`text-sm font-black ${
                                isNegative ? "text-red-600" : "text-emerald-600"
                              }`}
                            >
                              {formatRupiah(item.keuntunganBersih)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
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
                            Transaksi
                          </p>
                          <p className="mt-1 text-sm font-black text-slate-800">
                            {item.jumlahTransaksi}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Data Pengeluaran
                          </p>
                          <p className="mt-1 text-sm font-black text-slate-800">
                            {item.jumlahDataPengeluaran}
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
                Toko Teratas
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Ranking toko berdasarkan keuntungan bersih
              </p>
            </div>

            {rankingToko.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-3">
                {rankingToko.slice(0, 8).map((item, idx) => {
                  const isNegative = item.keuntunganBersih < 0

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
                                {item.bulanAktif} bulan aktif
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
                            {formatRupiah(item.keuntunganBersih)}
                          </p>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Kotor {formatRupiah(item.penghasilanKotor)}
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
                Ringkasan
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Gambaran cepat keuntungan bersih
              </p>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-800">Total Kotor</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      Dari laporan bulanan
                    </p>
                  </div>
                  <p className="text-sm font-black text-slate-800">
                    {formatRupiah(totalPenghasilanKotor)}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-800">Total Pengeluaran</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      Dari data pengeluaran
                    </p>
                  </div>
                  <p className="text-sm font-black text-red-600">
                    {formatRupiah(totalPengeluaran)}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-800">Total Bersih</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      Kotor dikurangi pengeluaran
                    </p>
                  </div>
                  <p
                    className={`text-sm font-black ${
                      totalKeuntunganBersih < 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {formatRupiah(totalKeuntunganBersih)}
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
                    <p className="text-sm font-black text-slate-800">Toko Aktif</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      Toko yang punya data
                    </p>
                  </div>
                  <p className="text-sm font-black text-slate-800">{rankingToko.length}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-800">Kondisi</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      Status total keuntungan bersih
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {totalKeuntunganBersih < 0 ? (
                      <TrendingDown size={16} className="text-red-500" />
                    ) : (
                      <TrendingUp size={16} className="text-emerald-500" />
                    )}
                    <p
                      className={`text-sm font-black ${
                        totalKeuntunganBersih < 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {totalKeuntunganBersih < 0 ? "Minus" : "Positif"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}