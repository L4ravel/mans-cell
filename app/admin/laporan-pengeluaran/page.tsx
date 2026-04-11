/* 
  Halaman admin laporan pengeluaran.
  File ini membaca koleksi pengeluaran dari Firestore untuk menampilkan
  total pengeluaran, chart pengeluaran per bulan, breakdown kategori,
  ranking toko, dan daftar detail pengeluaran dengan filter periode.
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
  RefreshCw,
  Search,
  Store,
  Tags,
  TrendingDown,
  Wallet,
} from "lucide-react"
import { motion } from "framer-motion"

type Toko = {
  id: string
  nama: string
  aktif?: boolean
}

type KategoriPengeluaran = {
  id: string
  nama: string
  aktif?: boolean
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

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatTanggal(value?: string) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date)
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
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-orange-500 text-white shadow-sm">
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
          } pr-8 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-orange-300 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20`}
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

export default function LaporanPengeluaranPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriPengeluaran[]>([])
  const [pengeluaranList, setPengeluaranList] = useState<Pengeluaran[]>([])

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterKategori, setFilterKategori] = useState("")
  const [bulanMulai, setBulanMulai] = useState(getStartOfYearMonthInput())
  const [bulanSelesai, setBulanSelesai] = useState(toMonthInputValue(new Date()))

  const fetchAll = async () => {
    setLoading(true)
    setError(null)

    try {
      const [tokoSnap, kategoriSnap, pengeluaranSnap] = await Promise.all([
        getDocs(query(collection(db, "toko"), orderBy("nama"))),
        getDocs(query(collection(db, "kategori_pengeluaran"), orderBy("nama"))),
        getDocs(query(collection(db, "pengeluaran"), orderBy("createdAtMs", "desc"))),
      ])

      const tokoData: Toko[] = tokoSnap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: x?.nama || "",
          aktif: Boolean(x?.aktif),
        }
      })

      const kategoriData: KategoriPengeluaran[] = kategoriSnap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: x?.nama || "",
          aktif: Boolean(x?.aktif ?? true),
        }
      })

      const pengeluaranData: Pengeluaran[] = pengeluaranSnap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          tanggal: String(x?.tanggal || ""),
          tanggalKey: String(x?.tanggalKey || ""),
          bulanKey: String(x?.bulanKey || ""),
          tokoId: String(x?.tokoId || ""),
          tokoNama: String(x?.tokoNama || ""),
          kategoriId: String(x?.kategoriId || ""),
          kategoriNama: String(x?.kategoriNama || ""),
          nominal: Number(x?.nominal || 0),
          catatan: String(x?.catatan || ""),
          createdAtMs: Number(x?.createdAtMs || 0),
        }
      })

      setTokoList(tokoData.filter((item) => item.nama))
      setKategoriList(kategoriData.filter((item) => item.nama))
      setPengeluaranList(pengeluaranData.filter((item) => item.bulanKey))
    } catch (err) {
      console.error(err)
      setError("Gagal memuat laporan pengeluaran")
      setTokoList([])
      setKategoriList([])
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

  const filteredPengeluaran = useMemo(() => {
    const q = search.toLowerCase().trim()

    return pengeluaranList.filter((item) => {
      const matchSearch =
        !q ||
        item.kategoriNama.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.catatan.toLowerCase().includes(q) ||
        item.tanggalKey.toLowerCase().includes(q) ||
        item.bulanKey.toLowerCase().includes(q)

      const matchToko = !filterToko || item.tokoId === filterToko
      const matchKategori = !filterKategori || item.kategoriId === filterKategori
      const matchStart = !bulanMulai || item.bulanKey >= bulanMulai
      const matchEnd = !bulanSelesai || item.bulanKey <= bulanSelesai

      return matchSearch && matchToko && matchKategori && matchStart && matchEnd
    })
  }, [pengeluaranList, search, filterToko, filterKategori, bulanMulai, bulanSelesai])

  const totalPengeluaran = filteredPengeluaran.reduce(
    (acc, item) => acc + Number(item.nominal || 0),
    0
  )

  const totalData = filteredPengeluaran.length

  const pengeluaranBulanIni = filteredPengeluaran
    .filter((item) => item.bulanKey === toMonthInputValue(new Date()))
    .reduce((acc, item) => acc + item.nominal, 0)

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

  const tokoBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { tokoId: string; tokoNama: string; total: number; jumlah: number; bulanAktif: number }
    >()

    for (const item of filteredPengeluaran) {
      const key = item.tokoId || item.tokoNama || item.id
      const current = map.get(key) || {
        tokoId: item.tokoId,
        tokoNama: item.tokoNama || "Tanpa Toko",
        total: 0,
        jumlah: 0,
        bulanAktif: 0,
      }

      current.total += Number(item.nominal || 0)
      current.jumlah += 1
      map.set(key, current)
    }

    const bulanMap = new Map<string, Set<string>>()

    for (const item of filteredPengeluaran) {
      const key = item.tokoId || item.tokoNama || item.id
      if (!bulanMap.has(key)) bulanMap.set(key, new Set<string>())
      bulanMap.get(key)?.add(item.bulanKey)
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        bulanAktif: bulanMap.get(item.tokoId || item.tokoNama || "")?.size || 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [filteredPengeluaran])

  const pengeluaranPerBulan = useMemo(() => {
    const map = new Map<
      string,
      {
        bulanKey: string
        total: number
        jumlah: number
        tokoCount: number
        kategoriCount: number
      }
    >()

    const tokoPerBulan = new Map<string, Set<string>>()
    const kategoriPerBulan = new Map<string, Set<string>>()

    for (const item of filteredPengeluaran) {
      const key = item.bulanKey
      const current = map.get(key) || {
        bulanKey: key,
        total: 0,
        jumlah: 0,
        tokoCount: 0,
        kategoriCount: 0,
      }

      current.total += Number(item.nominal || 0)
      current.jumlah += 1
      map.set(key, current)

      if (!tokoPerBulan.has(key)) tokoPerBulan.set(key, new Set<string>())
      if (!kategoriPerBulan.has(key)) kategoriPerBulan.set(key, new Set<string>())

      tokoPerBulan.get(key)?.add(item.tokoId || item.tokoNama || item.id)
      kategoriPerBulan.get(key)?.add(item.kategoriId || item.kategoriNama || item.id)
    }

    return Array.from(map.values()).map((item) => ({
      ...item,
      tokoCount: tokoPerBulan.get(item.bulanKey)?.size || 0,
      kategoriCount: kategoriPerBulan.get(item.bulanKey)?.size || 0,
    }))
  }, [filteredPengeluaran])

  const chartData = useMemo(() => {
    return [...pengeluaranPerBulan].sort((a, b) => a.bulanKey.localeCompare(b.bulanKey))
  }, [pengeluaranPerBulan])

  const maxChartValue = Math.max(...chartData.map((item) => item.total), 0)

  return (
    <div className="space-y-4 text-slate-900 sm:space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-rose-500 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-orange-500 shadow-lg shadow-rose-200/50 sm:h-14 sm:w-14">
              <BarChart3 size={24} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
            </div>

            <div>
              <h1 className="text-xl font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                Laporan Pengeluaran
              </h1>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                chart bulanan · kategori · toko
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
        className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-orange-500 bg-white p-4 shadow-sm"
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
                placeholder="Kategori, toko, catatan, tanggal..."
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-orange-300 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
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
            label="Kategori"
            value={filterKategori}
            onChange={setFilterKategori}
            icon={Tags}
          >
            <option value="">Semua Kategori</option>
            {kategoriList.map((item) => (
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
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all hover:border-orange-300 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
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
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all hover:border-orange-300 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard
          icon={Wallet}
          label="Total Pengeluaran"
          value={formatRupiah(totalPengeluaran)}
          subValue="Akumulasi sesuai periode filter"
        />
        <InfoCard
          icon={TrendingDown}
          label="Pengeluaran Bulan Ini"
          value={formatRupiah(pengeluaranBulanIni)}
          subValue="Akumulasi bulan berjalan"
        />
        <InfoCard
          icon={Tags}
          label="Kategori Pengeluaran"
          value={String(kategoriBreakdown.length)}
          subValue="Kategori terpakai pada periode ini"
        />
        <InfoCard
          icon={Store}
          label="Jumlah Toko"
          value={String(tokoBreakdown.length)}
          subValue="Toko dengan data pengeluaran"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Chart Pengeluaran Bulanan
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Grafik batang total pengeluaran per bulan
              </p>
            </div>

            {chartData.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-4">
                {chartData.map((item) => {
                  const persen =
                    maxChartValue > 0 ? (item.total / maxChartValue) * 100 : 0

                  return (
                    <div key={item.bulanKey}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                          {formatBulanKey(item.bulanKey)}
                        </p>
                        <p className="text-sm font-black text-rose-600">
                          {formatRupiah(item.total)}
                        </p>
                      </div>

                      <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-rose-400 to-orange-500"
                          style={{ width: `${Math.max(persen, 2)}%` }}
                        />
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-full bg-orange-50 px-3 py-1 text-[11px] font-bold text-orange-700 ring-1 ring-orange-200">
                          Transaksi: {item.jumlah}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
                          Toko: {item.tokoCount}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
                          Kategori: {item.kategoriCount}
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
                Detail Pengeluaran
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Daftar transaksi pengeluaran sesuai filter
              </p>
            </div>

            {filteredPengeluaran.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPengeluaran.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-800">{item.kategoriNama}</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          {item.tokoNama || "Tanpa Toko"} • {formatTanggal(item.tanggalKey)} •{" "}
                          {formatBulanKey(item.bulanKey)}
                        </p>
                        {item.catatan ? (
                          <p className="mt-2 text-[12px] font-semibold text-slate-600">
                            {item.catatan}
                          </p>
                        ) : null}
                      </div>

                      <div className="text-left sm:text-right">
                        <p className="text-sm font-black text-rose-600">
                          {formatRupiah(item.nominal)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 xl:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Toko Pengeluaran Terbesar
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Ranking toko berdasarkan total pengeluaran
              </p>
            </div>

            {tokoBreakdown.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-3">
                {tokoBreakdown.slice(0, 8).map((item, idx) => (
                  <div
                    key={`${item.tokoId}-${idx}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-[10px] font-black text-white">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-800">
                              {item.tokoNama}
                            </p>
                            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              {item.jumlah} transaksi • {item.bulanAktif} bulan aktif
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-black text-rose-600">
                          {formatRupiah(item.total)}
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
                Kategori Teratas
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Ranking kategori dengan total pengeluaran tertinggi
              </p>
            </div>

            {kategoriBreakdown.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-3">
                {kategoriBreakdown.slice(0, 8).map((item, idx) => (
                  <div
                    key={`${item.kategoriId}-${idx}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-800">
                              {item.kategoriNama}
                            </p>
                            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              {item.jumlah} Transaksi
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-black text-rose-600">
                          {formatRupiah(item.total)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}