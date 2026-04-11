/* 
  Halaman admin laporan bulanan.
  File ini membaca koleksi laporan_bulanan dari Firestore untuk menampilkan
  ringkasan omzet, transaksi, diskon, admin, laba kotor, breakdown metode bayar,
  ranking toko, dan daftar rekap bulanan dengan filter bulan, toko, dan pencarian.
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, getDocs, orderBy, query } from "firebase/firestore"
import {
  BarChart3,
  RefreshCw,
  AlertCircle,
  Search,
  Store,
  ChevronDown,
  Receipt,
  CircleDollarSign,
  Percent,
  BadgeDollarSign,
  Wallet,
  TrendingUp,
  CalendarDays,
  ShoppingCart,
} from "lucide-react"
import { motion } from "framer-motion"

type Toko = {
  id: string
  nama: string
  aktif?: boolean
}

type BreakdownMetode = {
  nama: string
  jumlahTransaksi: number
  omzet: number
  admin: number
}

type LaporanBulanan = {
  id: string
  bulanKey: string
  tahun: number
  bulan: number
  tokoId: string
  tokoNama: string
  jumlahTransaksi: number
  omzet: number
  subtotal: number
  totalDiskon: number
  totalSetelahDiskon: number
  totalBiayaAdmin: number
  totalModal: number
  totalLabaKotor: number
  totalItemTerjual: number
  totalJenisBarangTerjual: number
  rataRataBelanja: number
  metodePembayaranBreakdown: BreakdownMetode[]
  updatedAtMs: number
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
  const [year, month] = value.split("-")
  const y = Number(year || 0)
  const m = Number(month || 0)
  if (!y || !m) return value

  const date = new Date(y, m - 1, 1)
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(date)
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

export default function LaporanBulananPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [laporanList, setLaporanList] = useState<LaporanBulanan[]>([])

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [bulanMulai, setBulanMulai] = useState(getStartOfYearMonthInput())
  const [bulanSelesai, setBulanSelesai] = useState(toMonthInputValue(new Date()))

  const fetchAll = async () => {
    setLoading(true)
    setError(null)

    try {
      const [tokoSnap, laporanSnap] = await Promise.all([
        getDocs(query(collection(db, "toko"), orderBy("nama"))),
        getDocs(query(collection(db, "laporan_bulanan"), orderBy("bulanKey", "desc"))),
      ])

      const tokoData: Toko[] = tokoSnap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: x?.nama || "",
          aktif: Boolean(x?.aktif),
        }
      })

      const laporanData: LaporanBulanan[] = laporanSnap.docs.map((d) => {
        const x = d.data() as any

        const breakdown: BreakdownMetode[] = Array.isArray(x?.metodePembayaranBreakdown)
          ? x.metodePembayaranBreakdown.map((item: any) => ({
              nama: item?.nama || "Tanpa Nama",
              jumlahTransaksi: Number(item?.jumlahTransaksi || 0),
              omzet: Number(item?.omzet || 0),
              admin: Number(item?.admin || 0),
            }))
          : []

        return {
          id: d.id,
          bulanKey: x?.bulanKey || "",
          tahun: Number(x?.tahun || 0),
          bulan: Number(x?.bulan || 0),
          tokoId: x?.tokoId || "",
          tokoNama: x?.tokoNama || "",
          jumlahTransaksi: Number(x?.jumlahTransaksi || 0),
          omzet: Number(x?.omzet || 0),
          subtotal: Number(x?.subtotal || 0),
          totalDiskon: Number(x?.totalDiskon || 0),
          totalSetelahDiskon: Number(x?.totalSetelahDiskon || 0),
          totalBiayaAdmin: Number(x?.totalBiayaAdmin || 0),
          totalModal: Number(x?.totalModal || 0),
          totalLabaKotor: Number(x?.totalLabaKotor || 0),
          totalItemTerjual: Number(x?.totalItemTerjual || 0),
          totalJenisBarangTerjual: Number(x?.totalJenisBarangTerjual || 0),
          rataRataBelanja: Number(x?.rataRataBelanja || 0),
          metodePembayaranBreakdown: breakdown,
          updatedAtMs: Number(x?.updatedAtMs || 0),
        }
      })

      setTokoList(tokoData.filter((item) => item.nama))
      setLaporanList(laporanData.filter((item) => item.bulanKey))
    } catch (err) {
      console.error(err)
      setError("Gagal memuat laporan bulanan")
      setTokoList([])
      setLaporanList([])
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

  const filteredLaporan = useMemo(() => {
    const q = search.toLowerCase().trim()

    return laporanList.filter((item) => {
      const matchSearch =
        !q ||
        item.bulanKey.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.metodePembayaranBreakdown.some((metode) =>
          metode.nama.toLowerCase().includes(q)
        )

      const matchToko = !filterToko || item.tokoId === filterToko
      const matchStart = !bulanMulai || item.bulanKey >= bulanMulai
      const matchEnd = !bulanSelesai || item.bulanKey <= bulanSelesai

      return matchSearch && matchToko && matchStart && matchEnd
    })
  }, [laporanList, search, filterToko, bulanMulai, bulanSelesai])

  const totalOmzet = filteredLaporan.reduce((acc, item) => acc + item.omzet, 0)
  const totalTransaksi = filteredLaporan.reduce(
    (acc, item) => acc + item.jumlahTransaksi,
    0
  )
  const totalDiskon = filteredLaporan.reduce(
    (acc, item) => acc + item.totalDiskon,
    0
  )
  const totalAdmin = filteredLaporan.reduce(
    (acc, item) => acc + item.totalBiayaAdmin,
    0
  )
  const totalLabaKotor = filteredLaporan.reduce(
    (acc, item) => acc + item.totalLabaKotor,
    0
  )
  const totalItemTerjual = filteredLaporan.reduce(
    (acc, item) => acc + item.totalItemTerjual,
    0
  )
  const rataRataBelanja = totalTransaksi > 0 ? totalOmzet / totalTransaksi : 0

  const omzetBulanIni = filteredLaporan
    .filter((item) => item.bulanKey === toMonthInputValue(new Date()))
    .reduce((acc, item) => acc + item.omzet, 0)

  const metodeBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { nama: string; jumlahTransaksi: number; omzet: number; admin: number }
    >()

    for (const laporan of filteredLaporan) {
      for (const metode of laporan.metodePembayaranBreakdown || []) {
        const key = metode.nama || "Tanpa Nama"
        const current = map.get(key) || {
          nama: key,
          jumlahTransaksi: 0,
          omzet: 0,
          admin: 0,
        }

        current.jumlahTransaksi += Number(metode.jumlahTransaksi || 0)
        current.omzet += Number(metode.omzet || 0)
        current.admin += Number(metode.admin || 0)
        map.set(key, current)
      }
    }

    return Array.from(map.values()).sort((a, b) => b.omzet - a.omzet)
  }, [filteredLaporan])

  const tokoBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { tokoId: string; tokoNama: string; bulanAktif: number; transaksi: number; omzet: number }
    >()

    for (const laporan of filteredLaporan) {
      const key = laporan.tokoId || laporan.tokoNama || laporan.id
      const current = map.get(key) || {
        tokoId: laporan.tokoId,
        tokoNama: laporan.tokoNama || "Tanpa Toko",
        bulanAktif: 0,
        transaksi: 0,
        omzet: 0,
      }

      current.bulanAktif += 1
      current.transaksi += Number(laporan.jumlahTransaksi || 0)
      current.omzet += Number(laporan.omzet || 0)
      map.set(key, current)
    }

    return Array.from(map.values()).sort((a, b) => b.omzet - a.omzet)
  }, [filteredLaporan])

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
                Laporan Bulanan
              </h1>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Rekap bulanan · omzet · metode bayar · toko
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
                placeholder="Bulan, toko, metode pembayaran..."
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
          label="Omzet"
          value={formatRupiah(totalOmzet)}
          subValue={`${totalTransaksi} transaksi`}
        />
        <InfoCard
          icon={Receipt}
          label="Rata-rata Belanja"
          value={formatRupiah(rataRataBelanja)}
          subValue={`${totalItemTerjual} item terjual`}
        />
        <InfoCard
          icon={Percent}
          label="Diskon"
          value={formatRupiah(totalDiskon)}
          subValue={`Admin fee ${formatRupiah(totalAdmin)}`}
        />
        <InfoCard
          icon={BadgeDollarSign}
          label="Laba Kotor"
          value={formatRupiah(totalLabaKotor)}
          subValue="Akumulasi laporan bulanan"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard
          icon={TrendingUp}
          label="Omzet Bulan Ini"
          value={formatRupiah(omzetBulanIni)}
        />
        <InfoCard
          icon={ShoppingCart}
          label="Bulan Direkap"
          value={String(filteredLaporan.length)}
          subValue="Jumlah dokumen laporan"
        />
        <InfoCard
          icon={Store}
          label="Toko Aktif"
          value={String(tokoBreakdown.length)}
          subValue="Toko dengan data pada periode ini"
        />
        <InfoCard
          icon={Wallet}
          label="Metode Aktif"
          value={String(metodeBreakdown.length)}
          subValue="Metode pembayaran terpakai"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Penjualan per Metode Pembayaran
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Breakdown metode bayar dari laporan bulanan
              </p>
            </div>

            {metodeBreakdown.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-3">
                {metodeBreakdown.map((item) => {
                  const persenOmzet = totalOmzet > 0 ? (item.omzet / totalOmzet) * 100 : 0

                  return (
                    <div
                      key={item.nama}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-black text-slate-800">{item.nama}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {item.jumlahTransaksi} transaksi
                          </p>
                        </div>

                        <div className="text-left sm:text-right">
                          <p className="text-sm font-black text-slate-800">
                            {formatRupiah(item.omzet)}
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            Admin {formatRupiah(item.admin)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500"
                            style={{ width: `${Math.min(100, persenOmzet)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] font-bold text-slate-500">
                          {persenOmzet.toFixed(1)}% dari omzet
                        </p>
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
                Rekap Bulanan
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Daftar dokumen laporan_bulanan
              </p>
            </div>

            {filteredLaporan.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLaporan.map((item) => (
                  <div
                    key={item.id}
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

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Omzet
                          </p>
                          <p className="text-sm font-black text-slate-800">
                            {formatRupiah(item.omzet)}
                          </p>
                        </div>

                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Diskon
                          </p>
                          <p className="text-sm font-black text-slate-800">
                            {formatRupiah(item.totalDiskon)}
                          </p>
                        </div>

                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Admin
                          </p>
                          <p className="text-sm font-black text-slate-800">
                            {formatRupiah(item.totalBiayaAdmin)}
                          </p>
                        </div>

                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Laba
                          </p>
                          <p className="text-sm font-black text-emerald-600">
                            {formatRupiah(item.totalLabaKotor)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Item Terjual
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-800">
                          {item.totalItemTerjual}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Jenis Barang
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-800">
                          {item.totalJenisBarangTerjual}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Rata-rata
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-800">
                          {formatRupiah(item.rataRataBelanja)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Setelah Diskon
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-800">
                          {formatRupiah(item.totalSetelahDiskon)}
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
                Toko Teratas
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Ranking toko berdasarkan omzet
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
                        <p className="text-sm font-black text-slate-800">
                          {formatRupiah(item.omzet)}
                        </p>
                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          {item.transaksi} transaksi
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